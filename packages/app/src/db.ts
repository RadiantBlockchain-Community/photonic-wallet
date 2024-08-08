import Dexie, { Table } from "dexie";
import {
  SmartToken,
  TxO,
  BlockHeader,
  SubscriptionStatus,
  ContractBalance,
  BroadcastResult,
} from "./types";
import config from "@app/config.json";
import { shuffle } from "@lib/util";

export type KeyValuePairs = unknown;

export class Database extends Dexie {
  txo!: Table<TxO>;
  glyph!: Table<SmartToken>;
  subscriptionStatus!: Table<SubscriptionStatus>;
  kvp!: Table<KeyValuePairs>;
  header!: Table<BlockHeader>;
  balance!: Table<ContractBalance>;
  broadcast!: Table<BroadcastResult>;

  constructor() {
    super("photonic");
    this.version(1).stores({
      txo: "++id, &[txid+vout], contractType, [contractType+spent], [script+spent], [change+spent]",
      subscriptionStatus: "scriptHash",
      balance: "id",
      glyph:
        "++id, &ref, [type+spent], [type+spent+fresh], lastTxoId, height, tokenType",
      kvp: "",
      header: "hash, height",
      txq: "txid",
    });

    this.version(2).upgrade((transaction) => {
      // Populate servers with updated config, in random order
      const mainnet = shuffle(config.defaultConfig.servers.mainnet);
      const testnet = config.defaultConfig.servers.testnet;
      transaction.table("kvp").put({ mainnet, testnet }, "servers");
    });

    // Add container index
    this.version(3).stores({
      glyph:
        "++id, &ref, [type+spent], [type+spent+fresh], lastTxoId, height, tokenType, container",
    });

    // Add table for keeping track of transactions that have been broadcast
    this.version(4).stores({
      broadcast: "txid",
    });
  }
}

const db = new Database();

// Populate the database
db.on("ready", async () => {
  const defaults = config.defaultConfig;
  const configKeys = Object.keys(defaults);
  const missing = (await db.kvp.bulkGet(configKeys))
    .map((v, i) =>
      v
        ? false
        : [
            configKeys[i],
            (defaults as { [key: string]: unknown })[configKeys[i]],
          ]
    )
    .filter(Boolean);

  if (missing.length) {
    const obj = Object.fromEntries(missing as []);
    return db.kvp.bulkPut(Object.values(obj), Object.keys(obj));
  }
});

export default db;
