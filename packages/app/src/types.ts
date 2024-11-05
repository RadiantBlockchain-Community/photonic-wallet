/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore
import type { EncryptedData } from "@lib/encryption";
import { ElectrumUtxo, NetworkKey } from "@lib/types";
import { CreateToastFnReturn } from "@chakra-ui/react";

export type ScriptGroup = "rxd" | "ref" | "nft" | "ft";

// Type of script subscribed to
export enum ContractType {
  RXD,
  NFT,
  FT,
}

// Type of radiant smart token (mint operation)
export enum SmartTokenType {
  NFT,
  FT,
  DAT,
}

export interface TxO {
  id?: number;
  txid: string; // Can these be shared with Utxo type?
  vout: number;
  script: string;
  value: number;
  date?: number;
  height?: number;
  spent: 0 | 1;
  change?: 0 | 1;
  contractType: ContractType;
}

export interface SubscriptionStatus {
  scriptHash: string;
  status: string;
  contractType: ContractType;
  sync: {
    done: boolean;
    numSynced?: number;
    numTotal?: number;
    error?: boolean;
  };
}

export interface ContractBalance {
  id: string;
  confirmed: number;
  unconfirmed: number;
}

export interface BlockHeader {
  hash: string;
  height: number;
  buffer: ArrayBuffer;
  reorg: boolean;
}

export interface BroadcastResult {
  txid: string;
  description: string;
  date: number;
}

// Tokens that follow Radiant Smart Token standard
export interface SmartToken {
  id?: number;
  p?: (number | string)[];
  tokenType: SmartTokenType;
  ref: string;
  ticker?: string;
  lastTxoId?: number;
  revealOutpoint?: string;
  spent: 0 | 1;
  fresh: 0 | 1;
  location?: string;
  name: string;
  type: string; // User defined type
  immutable?: boolean;
  description: string;
  author: string;
  container: string;
  attrs: { [key: string]: string };
  embed?: { t: string; b: ArrayBuffer }; // Embedded file. TODO save multiple files? Should this go in OPFS or reference the OPFS raw tx?
  remote?: {
    t: string;
    u: string;
    h?: ArrayBuffer;
    hs?: ArrayBuffer;
  }; // Remote file
  height?: number;
}

export interface Subscription {
  // Provide toast to subscription so user can be notified
  register(address: string, toast: CreateToastFnReturn): void;
  syncPending(): void;
  manualSync(): void;
}

export type ElectrumCallback = (...payload: unknown[]) => unknown;

export type ElectrumStatusUpdate = (
  scriptHash: string,
  newStatus: string,
  manual: boolean
) => Promise<{
  added: TxO[];
  confs: Map<number, ElectrumUtxo>;
  conflict: Map<number, string>;
  spent: { id: number; value: number; script: string }[];
  utxoCount?: number;
}>;

export type SavedWallet = EncryptedData & { address: string; net: NetworkKey };

export interface WalletState {
  net: NetworkKey;
  ready: boolean;
  exists: boolean;
  locked: boolean;
  wif?: string;
  address: string;
}

export enum ElectrumStatus {
  LOADING,
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
}

export type NetworkConfig = {
  name: string;
  ticker: string;
  anchor: {
    height: number;
    bits: number;
    prevTime: number;
  };
  explorer: {
    tx: string;
  };
};

export {};
