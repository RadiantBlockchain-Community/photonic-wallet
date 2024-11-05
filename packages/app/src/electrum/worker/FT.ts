import { SmartToken, ContractType, ElectrumCallback, TxO } from "@app/types";
import { NFTWorker } from "./NFT";
import { buildUpdateTXOs } from "./updateTxos";
import ElectrumManager from "@app/electrum/ElectrumManager";
import { ftScript, ftScriptHash, parseFtScript } from "@lib/script";
import db from "@app/db";
import Outpoint, { reverseRef } from "@lib/Outpoint";
import setSubscriptionStatus from "./setSubscriptionStatus";
import { Worker } from "./electrumWorker";
import { consolidationCheck } from "./consolidationCheck";
import { updateFtBalances } from "@app/utxos";
import { arrayChunks } from "@lib/util";

export class FTWorker extends NFTWorker {
  protected ready = true;
  protected receivedStatuses: string[] = [];
  protected address = "";

  constructor(worker: Worker, electrum: ElectrumManager) {
    super(worker, electrum);
    this.updateTXOs = buildUpdateTXOs(
      this.electrum,
      ContractType.FT,
      (utxo) => {
        const ref = Outpoint.fromShortInput(utxo.refs?.[0]?.ref)
          .reverse()
          .toString();
        if (!ref) return undefined;
        return ftScript(this.address, ref);
      }
    );
  }

  async onSubscriptionReceived(
    scriptHash: string,
    status: string,
    manual = false
  ) {
    try {
      // Same subscription can be returned twice
      if (!manual && status === this.lastReceivedStatus) {
        console.debug("Duplicate subscription received", status);
        return;
      }

      if (
        !this.ready ||
        (!manual &&
          (!this.worker.active || (await db.kvp.get("consolidationRequired"))))
      ) {
        this.receivedStatuses.push(status);
        return;
      }

      this.ready = false;
      this.lastReceivedStatus = status;

      const { added, spent } = await this.updateTXOs(
        scriptHash,
        status,
        manual
      );

      // TODO there is some duplication in NFT and FT classes

      const existingRefs: { [key: string]: SmartToken } = {};
      const newRefs: { [key: string]: TxO } = {};
      const scriptRefMap: { [key: string]: string } = {};
      const glyphCache = new Map<string, [string, SmartToken | undefined]>();
      for (const txo of added) {
        if (!glyphCache.has(txo.script)) {
          const { ref: refLE } = parseFtScript(txo.script);
          if (!refLE) continue;
          const ref = reverseRef(refLE);
          scriptRefMap[txo.script] = ref;
          glyphCache.set(txo.script, [
            ref,
            ref ? await db.glyph.get({ ref }) : undefined,
          ]);
        }
        const [ref, glyph] = glyphCache.get(txo.script) as [
          string,
          SmartToken | undefined
        ];
        if (glyph) {
          existingRefs[ref] = glyph;
        } else {
          newRefs[ref] = txo;
        }
      }

      const { related, accepted } = await this.addTokens(newRefs);
      await this.addRelated(related);

      // This next part can take a long time for large wallets so show the progress bar
      let numSynced = 0;
      const updateProgress = async () => {
        await db.subscriptionStatus.update(scriptHash, {
          sync: {
            done: false,
            error: false,
            numSynced,
            numTotal: added.length,
          },
        });
      };

      // Insert txos and glyphs
      // IndexedDB doesn't seem to like lots of inserts at once so batch them
      const chunks = arrayChunks(added, 10000);
      for (const chunk of chunks) {
        await db.transaction("rw", db.txo, db.glyph, async () => {
          console.debug("Adding transactions", chunk.length);
          const ids = (await db.txo.bulkPut(chunk, undefined, {
            allKeys: true,
          })) as number[];
          const newGlyphs = new Map<string, SmartToken>();
          chunk.map((txo, index) => {
            const ref = scriptRefMap[txo.script];
            if (!newGlyphs.has(ref)) {
              newGlyphs.set(ref, existingRefs[ref] || accepted[ref]);
            }
            const glyph = newGlyphs.get(ref);
            if (glyph) {
              glyph.lastTxoId = ids[index];
              glyph.spent = 0;
            }
          });
          const validGlyphs = Array.from(newGlyphs.values()).filter(Boolean);
          for (const validGlyph of validGlyphs) {
            await db.glyph.put(validGlyph);
          }
        });
        numSynced += chunk.length;
        await updateProgress();
      }

      const touched = new Set([
        ...added.map(({ script }) => script),
        ...spent.map(({ script }) => script),
      ]);

      updateFtBalances(touched);

      setSubscriptionStatus(scriptHash, status, false, ContractType.FT);
      this.ready = true;
      if (this.receivedStatuses.length > 0) {
        const lastStatus = this.receivedStatuses.pop();
        this.receivedStatuses = [];
        if (lastStatus) {
          this.onSubscriptionReceived(scriptHash, lastStatus);
        }
      }

      consolidationCheck();
    } catch (error) {
      console.debug(error);
      db.subscriptionStatus.put({
        scriptHash,
        status: "",
        contractType: ContractType.FT,
        sync: { done: true, error: true },
      });
    }
  }

  async register(address: string) {
    this.scriptHash = ftScriptHash(address as string);
    this.address = address;

    this.electrum.client?.subscribe(
      "blockchain.scripthash",
      this.onSubscriptionReceived.bind(this) as ElectrumCallback,
      this.scriptHash
    );
  }
}
