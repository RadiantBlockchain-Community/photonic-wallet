import fs from "fs";
import chalk from "chalk";
import { Command } from "commander";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { ElectrumWS } from "ws-electrumx-client";
import rjs from "@radiantblockchain/radiantjs";
import {
  electrumToCoinSel,
  errorMessage,
  g,
  jsonHex,
  decryptWallet,
  readJson,
  resolveDir,
  loadWalletFile,
  catchErrors,
  electrumBroadcast,
  highlight,
} from "../utils";
import type {
  BundleFile,
  BundleDirectParams,
  CommitFile,
  BundleTokenFt,
  BundleTokenNft,
  RevealFile,
  StateFile,
  EmbeddedTokenFile,
  RemoteTokenFile,
} from "../types";
import path from "path";
import {
  commitBundle,
  createDelegateBase,
  createDelegateTokens,
} from "@photonic/lib/mint";
import { Outpoint, photonsToRXD } from "@photonic/lib";
import { p2pkhScriptHash, parseNftScript } from "@photonic/lib/script";
import { confirm, password } from "@inquirer/prompts";
import {
  SmartTokenPayload,
  ElectrumUtxo,
  Utxo,
  Wallet,
} from "@photonic/lib/types";
import { loadConfig } from "../config";
import ora, { Ora } from "ora";
import { GLYPH_FT, GLYPH_NFT } from "@photonic/lib/protocols";

const { Address, Transaction } = rjs;

const refBytes = (ref: string) =>
  hexToBytes(Outpoint.fromString(ref).reverse().toString());

export default async function bundleCommit(
  this: Command,
  inputDir: string | undefined,
  {
    wallet: walletArg,
    broadcast: broadcastArg,
    config: configFilename,
  }: {
    wallet: string;
    broadcast: boolean;
    config: string;
  }
) {
  const { log } = console;
  const call = catchErrors(this);

  const bundleDir = resolveDir(inputDir);
  const filename = path.join(bundleDir, "bundle.json");
  const cacheDir = path.join(bundleDir, "cache");
  const prepFilename = path.join(cacheDir, "bundle-lock.json");
  const stateFilename = path.join(cacheDir, "state.json");
  const outFilename = path.join(cacheDir, "commit.json");

  if (!fs.existsSync(filename)) {
    this.error(errorMessage("bundle.json not found"));
  }

  if (!fs.existsSync(prepFilename) || !fs.existsSync(stateFilename)) {
    this.error(errorMessage("Tokens are not prepared"));
  }

  const walletFile = call(() => loadWalletFile(walletArg));
  const config = call(() => loadConfig(walletFile.net, configFilename));
  const bundle = readJson(fs.readFileSync(prepFilename, "utf-8")) as BundleFile;
  const origBundleFile = fs.readFileSync(filename, "utf-8");
  const stateFile = readJson(
    fs.readFileSync(stateFilename, "utf-8")
  ) as StateFile;

  // Check cached data is valid for the bundle file
  if (bytesToHex(sha256(origBundleFile)) !== stateFile.bundleHash) {
    this.error(
      errorMessage(
        chalk("Cache is stale, please run", highlight("bundle:prepare"))
      )
    );
  }

  // TODO try other servers when connect fails
  const server = config.servers?.[0];

  if (!server) {
    this.error(errorMessage(`No ${walletFile.net} server configured`));
  }

  const client = new ElectrumWS(server);
  const broadcast = electrumBroadcast(client);
  const progress = ora();

  // Check if commit file exists and transactions are broadcast
  if (fs.existsSync(outFilename)) {
    // Don't broadcast if --no-broadcast given
    if (broadcastArg === false) {
      log("This bundle is already committed");
    } else {
      // Skip confirm if --broadcast given
      const doBroadcast =
        broadcastArg ||
        (await confirm({
          message: stateFile.broadcast.commit
            ? "This bundle is already committed. Rebroadcast transactions?"
            : "This bundle is ready to commit. Broadcast transactions?",
          default: true,
        }));
      if (doBroadcast) {
        const commitFile: CommitFile = readJson(
          fs.readFileSync(outFilename, "utf-8")
        );
        await broadcastCommits(progress, broadcast, commitFile);
        stateFile.broadcast.commit = true;
        fs.writeFileSync(stateFilename, jsonHex(stateFile));
      }
    }
    client.close("");
    return;
  }

  // Check local file sizes haven't changed since prepare
  bundle.tokens.map((token) =>
    Object.entries(token.files || {}).map((tokenFile) => {
      if (typeof tokenFile === "string") {
        if (
          fs.statSync(path.join(bundleDir, tokenFile)).size > config.maxFileSize
        ) {
          throw new Error(`File '${tokenFile}' is too large`);
        }
      }
    })
  );

  log("Prepared data validated");

  const pw = await password({ message: "Wallet password" });
  const wallet = await decryptWallet(pw, walletFile);
  if (!wallet) {
    this.error(errorMessage("Wallet decryption failed"));
  }

  log(chalk("Wallet unlocked:", highlight(wallet.address)));

  const readFile = (...paths: string[]) =>
    fs.readFileSync(path.join(bundleDir, ...paths));

  // Build token payloads
  const tokens = bundle.tokens.map((token) => {
    const files =
      token.files &&
      Object.fromEntries(
        Object.entries(token.files).map(([key, tokenFile]) => {
          if (typeof (tokenFile as EmbeddedTokenFile).path === "string") {
            const embed = tokenFile as EmbeddedTokenFile;
            return [key, { t: embed.contentType, b: readFile(embed.path) }];
          }
          const remote = tokenFile as RemoteTokenFile;
          const { src, hash, contentType } = remote;
          const srcHash = bytesToHex(sha256(remote.src));
          const hs = remote.stamp && readFile("cache", `hs.${srcHash}.webp`);
          return [
            key,
            {
              u: src,
              ...(contentType &&
                typeof contentType === "string" && { t: contentType }),
              ...(hash && typeof hash === "string" && { h: hexToBytes(hash) }),
              ...(hs && { hs }),
            },
          ];
        })
      );

    const meta = Object.fromEntries(
      [
        ...(
          [
            "name",
            "type",
            "author",
            "license",
            "desc",
          ] as (keyof BundleTokenNft)[]
        ).map((k) => [k, token[k]]),
        ["in", token.containerRefs?.map(refBytes)],
        ["by", token.authorRefs?.map(refBytes)],
        ["attrs", !!Object.keys(token.attrs || {}).length && token.attrs],
      ].filter(([, v]) => (Array.isArray(v) ? v.length : v))
    );

    const contract = token.contract;
    const args = {
      p: [contract === "ft" ? GLYPH_FT : GLYPH_NFT],
      ...(contract === "ft" && { ticker: (token as BundleTokenFt).ticker }),
    };

    return {
      contract,
      outputValue: (token as BundleTokenFt).supply || 1,
      payload: {
        ...args,
        ...meta,
        ...files,
      } as SmartTokenPayload,
    };
  });

  const connect = ora(`Connecting to ${server}`).start();
  client.on("close", (e) => {
    if (!(e as CloseEvent).wasClean) {
      if (connect.isSpinning) connect.fail(`Could not connect to ${server}`);
      this.error(errorMessage("ElectrumX disconnected"));
    }
  });

  // Get UTXOs for funding
  let unspentRxd: Utxo[] = electrumToCoinSel(
    await client.request(
      "blockchain.scripthash.listunspent",
      p2pkhScriptHash(wallet.address)
    )
  );
  connect.succeed(`Connected to ${server}`);

  // Get all related refs
  const relatedRefs = Array.from(
    new Set([
      ...bundle.tokens.flatMap(({ authorRefs, containerRefs }) => [
        ...(authorRefs || []),
        ...(containerRefs || []),
      ]),
    ])
  ).filter(Boolean) as string[];
  const fees: number[] = [];

  // Create a delegate ref for all related refs in the bundle
  const delegate =
    relatedRefs.length > 0
      ? await createRelatedDelegateTokens(
          this,
          unspentRxd,
          relatedRefs,
          Math.ceil(bundle.tokens.length / bundle.commit.batchSize),
          client,
          wallet,
          progress
        )
      : undefined;

  // Update UTXOs if delegate was created
  if (delegate) {
    unspentRxd = delegate.unspentRxd;
    fees.push(...delegate.fees);
  }

  progress.start("Building transactions");
  const step = (k: string) => {
    if (k === "sign") {
      progress.succeed();
      log("⌛Signing");
    }
  };

  let batches;
  try {
    batches = commitBundle(
      bundle.reveal.method,
      wallet.address,
      wallet.wif,
      unspentRxd,
      tokens,
      delegate && {
        ref: delegate.ref,
        utxos: delegate.utxos,
      },
      bundle.commit.batchSize,
      step
    );
  } catch (error) {
    this.error(errorMessage((error as Error).message || "Error"));
  }

  fees.push(...batches.fees);
  progress.succeed();

  const commitFile: CommitFile = {
    funding: batches.funding,
    delegate: delegate && {
      tx: delegate.tx,
      ref: delegate.ref,
    },
    commits: batches.commits,
  };

  log(chalk("Saving commit data to", highlight(path.basename(outFilename))));

  // Add payload array to commit file for human verification
  // This isn't used by the reveal command
  fs.writeFileSync(outFilename, jsonHex({ ...commitFile, tokens }));

  // Build a reveal.json file
  const revealFile: Partial<RevealFile> = {
    ...(bundle.reveal as BundleDirectParams),
    tokens: Object.fromEntries(
      batches.commits
        .flatMap((c) => c.data.map((r) => Outpoint.fromObject(r.utxo)))
        .map((ref, i) => [ref, bundle.tokens[i].reveal || {}])
    ),
  };

  fs.writeFileSync(
    path.join(bundleDir, "reveal.json"),
    jsonHex({ ...revealFile })
  );

  log(
    chalk(
      "Total transactions:",
      highlight((delegate ? 1 : 0) + batches.commits.length + 1)
    )
  );
  log(
    chalk(
      "Total fees:",
      highlight(photonsToRXD(fees.reduce((a, f) => a + f, 0))),
      config.ticker
    )
  );

  const proceed =
    broadcastArg === false
      ? false
      : broadcastArg === true ||
        (await confirm({ message: "Broadcast transactions?" }));

  if (proceed) {
    await broadcastCommits(progress, broadcast, commitFile);
    stateFile.broadcast.commit = true;
    fs.writeFileSync(stateFilename, jsonHex(stateFile));
  } else {
    log(g("Commit transactions ready to broadcast"));
    log(chalk(highlight("reveal.json"), "has been created"));
    log(
      "Rerun",
      highlight("bundle:commit"),
      "to broadcast commit transactions"
    );
  }

  client.close("");
}

async function broadcastCommits(
  progress: Ora,
  broadcast: (rawTx: string) => Promise<string>,
  { delegate, funding, commits }: CommitFile
) {
  const { log } = console;
  if (delegate) {
    progress.start("Creating delegate asset base");
    await broadcast(delegate.tx.base);
    progress.succeed();
    progress.start("Minting delegate tokens");
    await broadcast(delegate.tx.mint);
    progress.succeed();
  }
  progress.start("Creating funding outputs");
  await broadcast(funding.toString());
  progress.succeed();
  const commitProgressText = (i: number) =>
    `Commiting token batch ${i}/${commits.length}`;
  progress.start(commitProgressText(0));
  for (const [i, { tx }] of commits.entries()) {
    progress.text = commitProgressText(i + 1);
    await broadcast(tx);
  }
  progress.succeed();
  log(g("Commit transactions successfully broadcast!"));
  log(chalk(highlight("reveal.json"), "has been created"));
  log(
    chalk(
      "Make any necessary changes to the reveal file and complete token minting with the",
      highlight("bundle:reveal"),
      "command"
    )
  );
}

async function createRelatedDelegateTokens(
  cmd: Command,
  unspentRxd: Utxo[],
  refs: string[],
  numCommitBatches: number,
  client: ElectrumWS,
  wallet: Wallet,
  progress: Ora
) {
  let utxos = [...unspentRxd];
  let done = 0;
  const progressText = () => `Fetching refs (${done}/${refs.length})`;
  progress.start(progressText());
  const { debug } = console;
  // Fetch ref UTXOs
  const relUtxos = await Promise.all(
    refs.map(async (ref) => {
      debug(`Fetching ref: ${ref}`);
      const result = (await client.request(
        "blockchain.ref.get",
        ref
      )) as ElectrumUtxo[];
      debug(`Ref ${ref} response `, result);
      if (!result?.length) {
        cmd.error(errorMessage(chalk("Ref not found:", highlight(ref))));
      }
      const txid = result[result.length - 1].tx_hash;
      const hex = await client.request("blockchain.transaction.get", txid);

      const tx = new Transaction(hex);
      const hexAddress = Address.fromString(wallet.address).toObject().hash;

      // TODO can use findTokenOutput
      const refOutputIndex = tx.outputs.findIndex((output) => {
        const params = parseNftScript(output.script.toHex());
        const paramsRef =
          params.ref && Outpoint.fromString(params.ref).reverse().toString();
        if (paramsRef !== ref) {
          debug("Ref not equal. This might need to be fixed!");
          return false;
        }
        if (params.address !== hexAddress) {
          cmd.error(
            chalk(
              "Token is in a different wallet:",
              highlight(paramsRef),
              "Wallet:",
              highlight(params.address)
            )
          );
        }
        return true;
      });
      if (refOutputIndex === -1) {
        cmd.error(chalk("Ref not found:", highlight(ref)));
      }
      const output = tx.outputs[refOutputIndex];
      done++;
      progress.text = progressText();
      return {
        txid,
        vout: refOutputIndex,
        value: output.satoshis,
        script: output.script.toHex(),
      };
    })
  );
  progress.succeed();

  const fees: number[] = [];
  const base = createDelegateBase(wallet.address, wallet.wif, utxos, relUtxos);

  utxos = [...base.remaining, ...base.change];
  fees.push(base.fee);

  const delegates = createDelegateTokens(
    wallet.address,
    wallet.wif,
    utxos,
    base.utxo,
    numCommitBatches
  );
  fees.push(delegates.fee);

  const ref = Outpoint.fromUTXO(base.utxo.txid, base.utxo.vout).reverse().ref();

  utxos = [...delegates.remaining, ...delegates.change];

  return {
    tx: {
      base: base.tx.toString(),
      mint: delegates.tx,
    },
    ref,
    utxos: delegates.delegateTokens,
    unspentRxd: utxos,
    fees,
  };
}
