import { useLiveQuery } from "dexie-react-hooks";
import { t } from "@lingui/macro";
import db from "@app/db";
import { useEffect, useRef } from "react";
import { electrumStatus, wallet } from "@app/signals";
import { useToast } from "@chakra-ui/react";
import { ContractType, ElectrumStatus, SmartToken } from "@app/types";
import { wrap } from "comlink";
import { signal } from "@preact/signals-react";
import { ElectrumRefResponse, ElectrumUtxo } from "@lib/types";

// Android Chrome doesn't support shared workers, fall back to dedicated worker
// TEMP: Force dedicated worker for debugging (SharedWorker logs go to separate console)
const sharedSupported = false; // "SharedWorker" in globalThis;

// Detect Safari - it has issues with ES module workers
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
if (isSafari) {
  console.warn("[Electrum] Safari detected - module workers may have issues");
}

// SharedWorker and Worker must be used directly so Vite can compile the worker
let worker: Worker | MessagePort;
try {
  worker = sharedSupported
    ? new SharedWorker(new URL("./worker/electrumWorker.ts", import.meta.url), {
        type: "module",
      }).port
    : new Worker(new URL("./worker/electrumWorker.ts", import.meta.url), {
        type: "module",
      });
  
  // Add error listener to catch worker initialization failures
  if (worker instanceof Worker) {
    worker.onerror = (e) => {
      console.error("[Electrum] Worker error:", e.message, e);
    };
  }
} catch (e) {
  console.error("[Electrum] Failed to create worker:", e);
  throw e;
}

const wrapped = wrap<{
  setServers: (servers: string[]) => void;
  connect: (address: string) => void;
  isReady: () => boolean;
  reconnect: () => boolean;
  disconnect: (reason: string) => void;
  broadcast: (hex: string) => string;
  getRef: (ref: string) => ElectrumRefResponse;
  getTransaction: (txid: string) => string;
  syncPending: (manual?: boolean) => void;
  manualSync: () => void;
  setActive: (active: boolean) => void;
  isActive: () => boolean;
  fetchGlyph: (refBE: string) => SmartToken | undefined;
  findSwaps(
    address: string
  ): { contractType: ContractType; utxo: ElectrumUtxo }[];
  isUtxoUnspent: (txid: string, vout: number, scriptHash: string) => boolean;
}>(worker);
export const electrumWorker = signal<typeof wrapped>(wrapped);

export default function Electrum() {
  const toast = useToast();

  // Electrum connection is handled by a worker. It will set connection status in the database using Dexie.
  useLiveQuery(async () => {
    const result = (await db.kvp.get("electrumStatus")) as { status: number };
    if (
      (await electrumWorker.value.isReady()) &&
      result &&
      result.status !== electrumStatus.value
    ) {
      electrumStatus.value = result.status;

      if (result.status === ElectrumStatus.CONNECTED) {
        toast({
          title: t`Connected`,
          status: "success",
        });
      } else if (result.status === ElectrumStatus.DISCONNECTED) {
        toast({
          title: t`Disconnected`,
          // FIXME
          status: "error", //reason === "user" ? "success" : "error",
        });
      }
    }
  });

  const servers = useLiveQuery(async () => {
    const servers = (await db.kvp.get("servers")) as {
      mainnet: string[];
      testnet: string[];
    };
    return servers?.[wallet.value.net];
  }, [wallet.value.net]);

  // Stabilize servers reference - only update when content actually changes
  const serversRef = useRef<string[] | undefined>();
  const stableServers = (() => {
    const prev = serversRef.current;
    if (prev && servers && prev.length === servers.length && prev.every((s, i) => s === servers[i])) {
      return prev;
    }
    serversRef.current = servers;
    return servers;
  })();

  // Reconnect when server config changes or when wallet is ready
  useEffect(() => {
    if (stableServers && wallet.value.address) {
      console.debug("[Electrum] Connecting with servers:", stableServers.length);
      electrumWorker.value.setServers(stableServers);
      electrumWorker.value.connect(wallet.value.address);
    }
  }, [stableServers, wallet.value.address]);

  return null;
}
