import "./polyfill";
import { expose } from "comlink";
import ElectrumManager from "../ElectrumManager";
import { FTWorker, NFTWorker, RXDWorker } from "./index";
import db from "@app/db";
import { ElectrumStatus } from "@app/types";
import { ElectrumRefResponse } from "@lib/types";
import { findSwaps } from "./findSwaps";
import { isUtxoUnspent } from "./isUtxoUnspent";

type Timer = ReturnType<typeof setTimeout> | null;

declare const self: SharedWorkerGlobalScope;

const electrum = new ElectrumManager();
// Disable until SPV is implemented
//const headers = new HeadersWorker(electrum);
let address = "";
let servers: string[] = [];
let serverNum = 0;
let reconnectTimer: Timer = null;
let connectTimer: Timer = null;

const worker = {
  ready: false,
  active: true,
  setServers(newServers: string[]) {
    serverNum = 0;
    servers = newServers;
  },
  connect(_address: string) {
    const endpoint = servers[serverNum];
    if (electrum.endpoint !== endpoint || address !== _address) {
      this.ready = true;
      address = _address;
      console.debug(`Connecting: ${endpoint} ${address}`);
      db.kvp.put({ status: ElectrumStatus.CONNECTING }, "electrumStatus");
      electrum.changeEndpoint(endpoint);
      clearTimers();
      connectTimer = setTimeout(tryNextServer, 10000);
    }
  },
  reconnect() {
    return electrum.reconnect();
  },
  disconnect(reason: string) {
    electrum.disconnect(reason);
  },
  async broadcast(hex: string) {
    return await electrum.client?.request(
      "blockchain.transaction.broadcast",
      hex
    );
  },
  async getRef(ref: string) {
    return (await electrum.client?.request(
      "blockchain.ref.get",
      ref
    )) as ElectrumRefResponse;
  },
  async getTransaction(txid: string) {
    return (await electrum.client?.request(
      "blockchain.transaction.get",
      txid
    )) as string;
  },
  isReady() {
    return this.ready;
  },
  async syncPending() {
    await rxd.syncPending();
    await ft.syncPending();
    await nft.syncPending();
  },
  async manualSync() {
    await rxd.manualSync();
    await ft.manualSync();
    await nft.manualSync();
  },
  setActive(active: boolean) {
    this.active = active;
  },
  isActive() {
    return this.active;
  },
  async fetchGlyph(ref: string) {
    return nft.fetchGlyph(ref);
  },
  async findSwaps(address: string) {
    return findSwaps(electrum, address);
  },
  async isUtxoUnspent(txid: string, vout: number, scriptHash: string) {
    return isUtxoUnspent(electrum, txid, vout, scriptHash);
  },
};

const rxd = new RXDWorker(worker, electrum);
const nft = new NFTWorker(worker, electrum);
const ft = new FTWorker(worker, electrum);

export type Worker = typeof worker;

function clearTimers() {
  if (connectTimer) {
    clearTimeout(connectTimer);
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
  }
}

function tryNextServer() {
  console.debug("Trying next server");
  serverNum = (serverNum + 1) % Math.max(1, servers.length);
  worker.connect(address);
}

electrum.addEvent("connected", () => {
  clearTimers();
  db.kvp.put({ status: ElectrumStatus.CONNECTED }, "electrumStatus");
  if (address) {
    console.debug("Connected");
    rxd.register(address);
    nft.register(address);
    ft.register(address);
  }
});

electrum.addEvent("close", (event: unknown) => {
  // Reason will be "user" for disconnects initiated by the user
  const { reason } = event as { reason: string };
  db.kvp.put({ status: ElectrumStatus.DISCONNECTED, reason }, "electrumStatus");

  if (!reason) {
    // Allow some time to reconnect before trying a different server
    reconnectTimer = setTimeout(tryNextServer, 5000);
  }
});

// Android Chrome doesn't support shared workers, fall back to dedicated worker
if (
  typeof SharedWorkerGlobalScope !== "undefined" &&
  globalThis instanceof SharedWorkerGlobalScope
) {
  self.addEventListener("connect", (e) => expose(worker, e.ports[0]));
} else {
  expose(worker);
}
