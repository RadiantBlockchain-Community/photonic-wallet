/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
  nftScriptHash,
  parseDelegateBurnScript,
  parseDelegateBaseScript,
  parseNftScript,
  nftScript,
} from "@lib/script";
import {
  Subscription,
  ContractType,
  ElectrumCallback,
  ElectrumStatusUpdate,
  TxO,
  SmartToken,
  SmartTokenType,
} from "@app/types";
import { buildUpdateTXOs } from "./updateTxos";
import db from "@app/db";
import Outpoint, { reverseRef } from "@lib/Outpoint";
import {
  extractRevealPayload,
  filterAttrs,
  isImmutableToken,
} from "@lib/token";
import {
  Transaction,
  // @ts-ignore
} from "@radiantblockchain/radiantjs";
import { bytesToHex } from "@noble/hashes/utils";
import ElectrumManager from "@app/electrum/ElectrumManager";
import opfs from "@app/opfs";
import setSubscriptionStatus from "./setSubscriptionStatus";
import { batchRequests } from "@lib/util";
import { GLYPH_FT, GLYPH_NFT } from "@lib/protocols";
import { Worker } from "./electrumWorker";
import { consolidationCheck } from "./consolidationCheck";

// 500KB size limit
const fileSizeLimit = 500_000;

type TxIdHeight = {
  tx_hash: string;
  height: number;
};
type SingletonGetResponse = [TxIdHeight, TxIdHeight];

const toString = (str: unknown) => (typeof str === "string" ? str : "");

const filterRels = (reveal: Uint8Array[], commit: string[]) =>
  (reveal as Uint8Array[])
    .filter((rel) => rel instanceof Uint8Array)
    .map((rel) => bytesToHex(rel))
    .filter((rel) => commit.includes(rel))
    .map((rel) => Outpoint.fromString(rel).reverse().ref());

export class NFTWorker implements Subscription {
  protected worker: Worker;
  protected updateTXOs: ElectrumStatusUpdate;
  protected electrum: ElectrumManager;
  protected lastReceivedStatus: string;
  protected receivedStatuses: string[] = [];
  protected ready = true;
  protected address = "";
  protected scriptHash = "";

  constructor(worker: Worker, electrum: ElectrumManager) {
    this.worker = worker;
    this.electrum = electrum;
    this.updateTXOs = buildUpdateTXOs(
      this.electrum,
      ContractType.NFT,
      (utxo) => {
        const ref = Outpoint.fromShortInput(utxo.refs?.[0]?.ref)
          .reverse()
          .toString();
        if (!ref) return undefined;
        return nftScript(this.address, ref);
      }
    );
    this.lastReceivedStatus = "";
  }

  async syncPending() {
    if (this.ready && this.receivedStatuses.length > 0) {
      const lastStatus = this.receivedStatuses.pop();
      this.receivedStatuses = [];
      if (lastStatus) {
        await this.onSubscriptionReceived(this.scriptHash, lastStatus);
      }
    }
  }

  async onSubscriptionReceived(scriptHash: string, status: string) {
    // Same subscription can be returned twice
    if (status === this.lastReceivedStatus) {
      console.debug("Duplicate subscription received", status);
      return;
    }
    if (
      !this.ready ||
      !this.worker.active ||
      (await db.kvp.get("consolidationRequired"))
    ) {
      this.receivedStatuses.push(status);
      return;
    }

    this.ready = false;
    this.lastReceivedStatus = status;

    const { added, confs, spent } = await this.updateTXOs(scriptHash, status);

    const existingRefs: { [key: string]: SmartToken } = {};
    const newRefs: { [key: string]: TxO } = {};
    const scriptRefMap: { [key: string]: string } = {};
    for (const txo of added) {
      const { ref: refLE } = parseNftScript(txo.script);
      if (!refLE) continue;
      const ref = reverseRef(refLE);
      scriptRefMap[txo.script] = ref;
      const glyph = ref && (await db.glyph.get({ ref }));
      if (glyph) {
        existingRefs[ref] = glyph;
      } else {
        newRefs[ref] = txo;
      }
    }

    const { related, accepted } = await this.addTokens(newRefs);
    this.addRelated(related);

    // All glyphs should now be in the database. Insert txos.
    db.transaction("rw", db.txo, db.glyph, async () => {
      const ids = (await db.txo.bulkPut(added, undefined, {
        allKeys: true,
      })) as number[];
      await Promise.all(
        added.map(async (txo, index) => {
          const ref = scriptRefMap[txo.script];
          const glyph = existingRefs[ref] || accepted[ref];
          if (glyph) {
            glyph.lastTxoId = ids[index];
            glyph.spent = 0;
            await db.glyph.put(glyph);
          }
        })
      );
    });

    // Update any NFTs that have been transferred
    await db.transaction("rw", db.glyph, async () => {
      for (const lastTxo of spent) {
        await db.glyph.where({ lastTxoId: lastTxo.id }).modify({ spent: 1 });
      }
    });

    // Update heights
    await db.transaction("rw", db.glyph, async () => {
      for (const [lastTxoId, conf] of confs) {
        await db.glyph
          .where({ lastTxoId })
          .modify({ height: conf.height || Infinity });
      }
    });

    setSubscriptionStatus(scriptHash, status, ContractType.NFT);
    this.ready = true;
    if (this.receivedStatuses.length > 0) {
      const lastStatus = this.receivedStatuses.pop();
      this.receivedStatuses = [];
      if (lastStatus) {
        this.onSubscriptionReceived(scriptHash, lastStatus);
      }
    }

    consolidationCheck();
  }

  async register(address: string) {
    this.scriptHash = nftScriptHash(address as string);
    this.address = address;

    this.electrum.client?.subscribe(
      "blockchain.scripthash",
      this.onSubscriptionReceived.bind(this) as ElectrumCallback,
      this.scriptHash
    );
  }

  /**
   * Add new glyphs to the database
   *
   * @param refs TxOs containing glyph data
   * @param txMap Map of new transactions returned from ElectrumX
   * @returns glyphs added to the database and any related refs that were found
   */
  async addTokens(refs: {
    [key: string]: TxO | undefined;
  }): Promise<{ accepted: { [key: string]: SmartToken }; related: string[] }> {
    const refEntries = Object.entries(refs);

    // Get reveal transaction ids for all tokens
    // Reveal txids indexed by ref
    const fresh: string[] = []; // Keep track of which refs are fresh mints
    const refReveals = await batchRequests<[string, TxO | undefined], string>(
      refEntries,
      6,
      async ([ref, txo]) => {
        const result = (await this.electrum.client?.request(
          "blockchain.ref.get",
          ref
        )) as SingletonGetResponse;
        console.debug("ref.get", ref, result);
        const revealTxId = result.length ? result[0].tx_hash : "";

        // Check if this is freshly minted
        if (txo?.txid === revealTxId) {
          fresh.push(ref);
        }

        return [ref, revealTxId];
      }
    );

    // Dedup reveal txids
    const revealTxIds = Array.from(
      new Set(Object.values(refReveals) as string[])
    );
    const foundDelegates = new Set<string>();

    // Fetch reveals, object is indexed by txid
    const revealTxs = Object.fromEntries(
      (
        await Promise.all(
          revealTxIds.map(async (revealTxId) => {
            // Check if it's cached
            let hex = await opfs.getTx(revealTxId);

            if (!hex) {
              hex = (await this.electrum.client?.request(
                "blockchain.transaction.get",
                revealTxId
              )) as string;

              // Store in cache
              await opfs.putTx(revealTxId, hex);
            }

            if (hex) {
              const tx = new Transaction(hex);

              // Look for delegate burn
              const delegates = tx.outputs
                .map((o) => parseDelegateBurnScript(o.script.toHex()) as string)
                .filter(Boolean);
              delegates.length && console.debug(`Found delegates`, delegates);
              delegates.forEach(foundDelegates.add, foundDelegates);

              // Also save delegates so we don't need to look for them again later in saveGlyph
              return [revealTxId, { tx, delegates }];
            }

            console.warn("Reveal tx not found", revealTxId);
            return undefined;
          })
        )
      ).filter(Boolean) as [string, { tx: Transaction; delegates: string[] }][]
    );

    // Fetch any delegate refs that were found
    // foundDelegates is deduped so Promise.all can be used
    const delegateRefMap = Object.fromEntries(
      (
        await Promise.all(
          Array.from(foundDelegates).map(async (delegateRef) => {
            // Check if it's cached
            // FIXME should this use txid instead of ref?
            const refBE = Outpoint.fromString(delegateRef).reverse();
            let hex = await opfs.getTx(refBE.toString());

            // Fetch
            if (!hex) {
              hex = (await this.electrum.client?.request(
                "blockchain.transaction.get",
                refBE.getTxid()
              )) as string;
              // Store in cache
              hex && (await opfs.putTx(refBE.toString(), hex));
            }

            if (hex) {
              const tx = new Transaction(hex);
              const requiredRefs = parseDelegateBaseScript(
                tx.outputs[refBE.getVout()].script.toHex()
              );
              if (requiredRefs.length) {
                return [delegateRef, requiredRefs];
              }
            }

            return undefined;
          })
        )
      ).filter(Boolean) as [string, string[]][]
    );

    Object.keys(delegateRefMap).length &&
      console.debug("Delegate refs", delegateRefMap);

    const accepted: { [key: string]: SmartToken } = {};
    const relatedArrs = await Promise.all(
      refEntries.map(async ([ref, txo]) => {
        const delegatedRefs =
          revealTxs[refReveals[ref]]?.delegates.flatMap(
            (r) => delegateRefMap[r]
          ) || [];
        const { related, valid, glyph } = await this.saveGlyph(
          ref,
          txo,
          revealTxs[refReveals[ref]].tx,
          delegatedRefs,
          fresh.includes(ref)
        );
        if (valid && txo && glyph) {
          accepted[glyph.ref] = glyph;
        }
        return related;
      })
    );

    // Flatten and dedup related arrays
    const related = Array.from(new Set(relatedArrs.flat()));

    return { accepted, related };
  }

  // Decode a glyph and save to the database. Return the name so the user can be notified
  async saveGlyph(
    ref: string,
    receivedTxo: TxO | undefined, // Received txo can be undefined when token is an author or container dependency
    reveal: Transaction,
    delegatedRefs: string[],
    fresh: boolean
  ): Promise<{ related: string[]; valid?: boolean; glyph?: SmartToken }> {
    const { revealIndex, glyph } = extractRevealPayload(ref, reveal.inputs);
    if (!glyph) {
      console.info("Unrecognised token");
      return { related: [], valid: false };
    }

    let location = undefined;
    if (
      glyph.payload.loc !== undefined &&
      Number.isInteger(glyph.payload.loc)
    ) {
      // Location is set to a ref vout. Get the payload and merge.
      const vout = glyph.payload.loc as number;
      const op = Outpoint.fromString(ref);
      const linkedRef = Outpoint.fromUTXO(op.getTxid(), vout).toString();
      const linked = extractRevealPayload(linkedRef, reveal.inputs);
      if (linked.revealIndex >= 0 && linked.glyph?.payload) {
        glyph.payload = { ...linked.glyph.payload, ...glyph.payload };
        glyph.embeddedFiles = {
          ...linked.glyph.embeddedFiles,
          ...glyph.embeddedFiles,
        };
        glyph.remoteFiles = {
          ...linked.glyph.remoteFiles,
          ...glyph.remoteFiles,
        };
        location = linkedRef;
      }
    }

    const related: string[] = [];
    const { payload, embeddedFiles, remoteFiles } = glyph;

    const protocols = payload.p;

    const contract = protocols.includes(GLYPH_FT)
      ? "ft"
      : protocols.includes(GLYPH_NFT)
      ? "nft"
      : undefined;

    if (!contract) {
      console.info("Unregognised protocol");
      return { related: [], valid: false };
    }
    const { in: containers, by: authors } = payload;
    // Map token protocol to enum
    const tokenType =
      SmartTokenType[contract.toUpperCase() as keyof typeof SmartTokenType];

    // Look for related tokens in outputs
    const outputTokens = reveal.outputs
      .map((o) => parseNftScript(o.script.toHex()).ref) // TODO handle FT, dat
      .filter(Boolean) as string[];
    // Validate any author and container properties
    const allRefs = [...delegatedRefs, ...outputTokens];
    const container = containers ? filterRels(containers, allRefs)[0] : "";
    const author = authors ? filterRels(authors, allRefs)[0] : "";

    const type = toString(payload.type) || "object";
    const immutable = isImmutableToken(payload);

    const remote = remoteFiles.main;
    const embed =
      embeddedFiles.main && embeddedFiles.main.b.length < fileSizeLimit
        ? embeddedFiles.main
        : undefined;

    // Containers and authors will be fetched later
    if (container) related.push(container);
    if (author) related.push(author);

    const ticker =
      typeof payload.ticker === "string"
        ? payload.ticker.substring(0, 20)
        : undefined;
    const name = toString(payload.name).substring(0, 80);
    const record: SmartToken = {
      p: protocols,
      ref,
      tokenType,
      ticker,
      revealOutpoint: Outpoint.fromUTXO(reveal.id, revealIndex).toString(),
      spent: receivedTxo ? 0 : 1, // If not owned by user then set as spent
      fresh: fresh ? 1 : 0,
      type,
      immutable,
      location,
      name,
      description: toString(payload.desc).substring(0, 1000),
      author,
      container,
      attrs: payload.attrs ? filterAttrs(payload.attrs) : {},
      // TODO store files in OPFS instead of IndexedDB
      embed,
      remote,
      height: receivedTxo?.height || Infinity,
    };

    record.id = (await db.glyph.put(record)) as number;

    return {
      related,
      valid: true,
      glyph: record,
    };
  }

  async addRelated(related: string[]) {
    // Check if there are any new related tokens to fetch
    const newRelated = (
      await Promise.all(
        related.map(async (ref) =>
          (await db.glyph.get({ ref })) ? undefined : ref
        )
      )
    ).filter(Boolean) as string[];

    // Fetch containers and authors
    if (newRelated.length > 0) {
      console.debug("Fetching related", newRelated);
      console.debug(`Existing related: ${related.length - newRelated.length}`);

      // Fetch new related tokens. A TxO is not needed for these since they are not owned by this user
      // Only a glyph record is needed for displaying the author and container names
      const relatedRefs = newRelated.map((ref) => [ref, undefined]);

      await this.addTokens(Object.fromEntries(relatedRefs));
    }
  }
}
