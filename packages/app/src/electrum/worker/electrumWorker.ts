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
let connectionAttempts = 0;
let connectedGeneration = 0;
const MAX_ATTEMPTS_BEFORE_PAUSE = 10; // Pause after trying all servers twice
const FAILOVER_TIMEOUT = 8000; // 8 seconds before trying next server
const PAUSE_DURATION = 30000; // 30 second pause after max attempts

function workerLog(msg: string, data?: unknown) {
  console.debug(msg, data);
}

const worker = {
  ready: false,
  active: true,
  setServers(newServers: string[]) {
    workerLog("[Worker] setServers called:", newServers);
    serverNum = 0;
    servers = newServers;
  },
  connect(_address: string) {
    workerLog("[Worker] connect called", { address: _address, servers, serverNum });
    const endpoint = servers[serverNum];
    workerLog("[Worker] Selected endpoint:", endpoint);

    // If already connected to ANY valid server, don't tear down the connection
    // just because the React effect re-fired with a different serverNum.
    // Only reconnect if the address changed or we have no connection at all.
    if (electrum.connected() && address === _address) {
      workerLog("[Worker] Already connected, skipping reconnect");
      return;
    }

    if (electrum.endpoint !== endpoint || address !== _address) {
      this.ready = true;
      address = _address;
      clearTimers();
      workerLog(`[Worker] Connecting to: ${endpoint}`);
      db.kvp.put({ status: ElectrumStatus.CONNECTING, server: endpoint }, "electrumStatus");
      const result = electrum.changeEndpoint(endpoint);
      workerLog("[Worker] changeEndpoint result:", result);
      if (!result) {
        workerLog("[Worker] changeEndpoint failed, trying next server");
        tryNextServer();
        return;
      }
      connectTimer = setTimeout(tryNextServer, FAILOVER_TIMEOUT);
    } else {
      workerLog("[Worker] Skipping connection - already connected to same endpoint/address");
    }
  },
  reconnect() {
    return electrum.reconnect();
  },
  disconnect(reason: string) {
    electrum.disconnect(reason);
  },
  async broadcast(hex: string): Promise<string> {
    if (!electrum.client || !electrum.connected()) {
      throw new Error("Electrum client not connected");
    }

    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error("Broadcast timeout")), ms)
        ),
      ]);

    try {
      const result = await withTimeout(
        electrum.client.request("blockchain.transaction.broadcast", hex),
        15000
      );
      workerLog("[Worker] Broadcast result:", result);
      return result as string;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("transactionalreadyinblockchain")) {
        workerLog("[Worker] Broadcast already in blockchain");
        return "";
      }
      throw error;
    }
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
  connectionAttempts++;
  const totalServers = Math.max(1, servers.length);
  serverNum = (serverNum + 1) % totalServers;
  
  // If we've tried all servers multiple times, pause before retrying
  if (connectionAttempts >= MAX_ATTEMPTS_BEFORE_PAUSE) {
    workerLog(`[Worker] Tried all servers ${Math.floor(connectionAttempts / totalServers)} times, pausing for ${PAUSE_DURATION/1000}s`);
    db.kvp.put({ status: ElectrumStatus.DISCONNECTED, reason: "all_servers_failed" }, "electrumStatus");
    reconnectTimer = setTimeout(() => {
      connectionAttempts = 0; // Reset counter after pause
      worker.connect(address);
    }, PAUSE_DURATION);
    return;
  }
  
  workerLog(`[Worker] Trying next server (attempt ${connectionAttempts}): ${servers[serverNum]}`);
  worker.connect(address);
}

electrum.addEvent("connected", () => {
  workerLog("[Worker] CONNECTED event received");
  clearTimers();
  connectionAttempts = 0; // Reset on successful connection
  connectedGeneration = electrum.generation;
  db.kvp.put({ status: ElectrumStatus.CONNECTED, server: electrum.endpoint }, "electrumStatus");
  if (address) {
    workerLog("[Worker] Connected, registering address:", address);
    rxd.register(address);
    nft.register(address);
    ft.register(address);
  }
});

electrum.addEvent("error", (error: unknown) => {
  workerLog("[Worker] ERROR event received:", error);
});

electrum.addEvent("close", (event: unknown) => {
  const { reason } = event as { reason: string };
  workerLog("[Worker] CLOSE event received", { reason, gen: electrum.generation, connGen: connectedGeneration });

  // Ignore close events from old clients when we intentionally switched servers
  if (reason === "switching") {
    workerLog("[Worker] Ignoring close from intentional server switch");
    return;
  }

  // Ignore stale close events from old connections
  if (electrum.connected()) {
    workerLog("[Worker] Ignoring stale close - already connected to another server");
    return;
  }

  db.kvp.put({ status: ElectrumStatus.DISCONNECTED, reason }, "electrumStatus");

  // Reason will be "user" for disconnects initiated by the user
  if (!reason) {
    workerLog("[Worker] Server dropped connection, will try next server in 5s");
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
