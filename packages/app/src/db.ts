import Dexie, { Table } from "dexie";
import {
  SmartToken,
  TxO,
  BlockHeader,
  SubscriptionStatus,
  ContractBalance,
  BroadcastResult,
  TokenSwap,
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
  swap!: Table<TokenSwap>;

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

    this.version(5).upgrade(async (transaction) => {
      const { mainnet } = await transaction.table("kvp").get("servers");

      // Add new servers and shuffle if they aren't in the db already
      const hasNewServers = mainnet.some(
        (server: string) => !server.includes("radiant4people")
      );

      if (!hasNewServers) {
        const newServers = config.defaultConfig.servers.mainnet.slice(2);
        mainnet.push(...newServers);
        shuffle(mainnet);
      }

      const testnet = config.defaultConfig.servers.testnet;
      transaction.table("kvp").put({ mainnet, testnet }, "servers");
    });

    this.version(6).stores({
      swap: "++id, status, txid",
    });

    // Update servers to latest list (V2 hard fork compatible)
    this.version(7).upgrade(async (transaction) => {
      const mainnet = shuffle([...config.defaultConfig.servers.mainnet]);
      const testnet = config.defaultConfig.servers.testnet;
      transaction.table("kvp").put({ mainnet, testnet }, "servers");
    });

    // Remove failing :50004 servers, keep only working :50022 servers
    this.version(8).upgrade(async (transaction) => {
      const mainnet = shuffle([...config.defaultConfig.servers.mainnet]);
      const testnet = config.defaultConfig.servers.testnet;
      transaction.table("kvp").put({ mainnet, testnet }, "servers");
    });

    // Merge in any newly added default servers without dropping user-edited entries
    this.version(9).upgrade(async (transaction) => {
      const current = (await transaction.table("kvp").get("servers")) as
        | { mainnet?: string[]; testnet?: string[] }
        | undefined;

      const mainnet = [...(current?.mainnet || [])];
      const missing = config.defaultConfig.servers.mainnet.filter(
        (server) => !mainnet.includes(server)
      );

      if (missing.length > 0) {
        mainnet.push(...missing);
      }

      const testnet = current?.testnet?.length
        ? current.testnet
        : config.defaultConfig.servers.testnet;

      transaction
        .table("kvp")
        .put({ mainnet: shuffle(mainnet), testnet }, "servers");
    });
  }
}

const db = new Database();

// Populate the database
db.on("ready", async () => {
  const defaults = config.defaultConfig;
  const configKeys = Object.keys(defaults);
  shuffle(config.defaultConfig.servers.mainnet);
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
