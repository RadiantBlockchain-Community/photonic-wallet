import Outpoint from "@lib/Outpoint";
import { sha256 } from "@noble/hashes/sha256";
import { Buffer } from "buffer";
import { ContractType, SmartTokenType } from "./types";

// SwapOffer as defined in Radiant Core's swapindex.h
export interface SwapOffer {
  version: number;
  flags: number;
  offered_type: number;
  terms_type: number;
  tokenid: string;
  want_tokenid?: string;
  utxo: {
    txid: string;
    vout: number;
  };
  price_terms: string; // hex-encoded serialized output
  signature: string; // hex-encoded partial signature
  block_height: number;
}

export interface SwapOrderCounts {
  open: number;
  history: number;
}

// Parsed swap offer with decoded terms for UI display
export interface ParsedSwapOffer extends SwapOffer {
  wantScript?: string;
  wantValue?: number;
  wantOutputs?: { script: string; value: number }[];
  offeredContractType: ContractType;
  wantContractType: ContractType;
  offeredTokenType?: SmartTokenType;
  wantTokenType?: SmartTokenType;
}

// Configuration for RPC endpoint
export interface SwapRpcConfig {
  url: string;
  username?: string;
  password?: string;
}

// Default RPC endpoint used by Open Orders / swap views
const DEFAULT_RPC_CONFIG: SwapRpcConfig = {
  url: "https://radiantcore.org:50004",
};

let rpcConfig: SwapRpcConfig = DEFAULT_RPC_CONFIG;

export function setSwapRpcConfig(config: SwapRpcConfig) {
  rpcConfig = config;
}

export function getSwapRpcConfig(): SwapRpcConfig {
  return rpcConfig;
}

/**
 * Make an RPC call to Radiant Core
 */
async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (rpcConfig.username && rpcConfig.password) {
    const auth = btoa(`${rpcConfig.username}:${rpcConfig.password}`);
    headers["Authorization"] = `Basic ${auth}`;
  }

  const response = await fetch(rpcConfig.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.error) {
    throw new Error(`RPC error: ${data.error.message || JSON.stringify(data.error)}`);
  }

  return data.result as T;
}

/**
 * Get open orders for a token (orders offering this token)
 */
export async function getOpenOrders(
  tokenRef: string,
  limit = 100,
  offset = 0,
  maxAge?: number
): Promise<SwapOffer[]> {
  const params: (string | number | null)[] = [tokenRef, limit, offset];
  if (maxAge !== undefined) {
    params.push(maxAge);
  }
  return rpcCall<SwapOffer[]>("getopenorders", params);
}

/**
 * Get open orders for a wanted token (orders wanting this token)
 */
export async function getOpenOrdersByWant(
  wantTokenRef: string,
  limit = 100,
  offset = 0,
  maxAge?: number
): Promise<SwapOffer[]> {
  const params: (string | number | null)[] = [wantTokenRef, limit, offset];
  if (maxAge !== undefined) {
    params.push(maxAge);
  }
  return rpcCall<SwapOffer[]>("getopenordersbywant", params);
}

/**
 * Get swap history for a token
 */
export async function getSwapHistory(
  tokenRef: string,
  limit = 100,
  offset = 0
): Promise<SwapOffer[]> {
  return rpcCall<SwapOffer[]>("getswaphistory", [tokenRef, limit, offset]);
}

/**
 * Get swap history by wanted token
 */
export async function getSwapHistoryByWant(
  wantTokenRef: string,
  limit = 100,
  offset = 0
): Promise<SwapOffer[]> {
  return rpcCall<SwapOffer[]>("getswaphistorybywant", [wantTokenRef, limit, offset]);
}

/**
 * Get order counts for a token
 */
export async function getSwapCount(tokenRef: string): Promise<SwapOrderCounts> {
  return rpcCall<SwapOrderCounts>("getswapcount", [tokenRef]);
}

/**
 * Get order counts by wanted token
 */
export async function getSwapCountByWant(wantTokenRef: string): Promise<SwapOrderCounts> {
  return rpcCall<SwapOrderCounts>("getswapcountbywant", [wantTokenRef]);
}

/**
 * Get swap index info
 */
export async function getSwapIndexInfo(): Promise<{
  enabled: boolean;
  current_height: number;
  total_orders: number;
  open_orders: number;
  history_orders: number;
  history_blocks: number;
}> {
  return rpcCall("getswapindexinfo", []);
}

/**
 * Check if swap index is available
 */
export async function isSwapIndexAvailable(): Promise<boolean> {
  try {
    const info = await getSwapIndexInfo();
    return info.enabled;
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readCompactSize(bytes: Uint8Array, offset: number) {
  if (offset >= bytes.length) {
    throw new Error("Invalid CompactSize");
  }

  const first = bytes[offset];
  if (first < 253) {
    return { value: first, size: 1 };
  }

  if (first === 253) {
    if (offset + 3 > bytes.length) {
      throw new Error("Invalid CompactSize");
    }
    return {
      value: bytes[offset + 1] | (bytes[offset + 2] << 8),
      size: 3,
    };
  }

  if (first === 254) {
    if (offset + 5 > bytes.length) {
      throw new Error("Invalid CompactSize");
    }
    return {
      value:
        bytes[offset + 1] |
        (bytes[offset + 2] << 8) |
        (bytes[offset + 3] << 16) |
        (bytes[offset + 4] << 24),
      size: 5,
    };
  }

  throw new Error("CompactSize value too large");
}

function encodeCompactSize(value: number): Uint8Array {
  if (value < 253) {
    return Uint8Array.from([value]);
  }

  if (value <= 0xffff) {
    return Uint8Array.from([253, value & 0xff, (value >> 8) & 0xff]);
  }

  if (value <= 0xffffffff) {
    return Uint8Array.from([
      254,
      value & 0xff,
      (value >> 8) & 0xff,
      (value >> 16) & 0xff,
      (value >> 24) & 0xff,
    ]);
  }

  throw new Error("CompactSize value too large");
}

function encodeOutput(script: string, value: number) {
  const valueBytes = new Uint8Array(8);
  let remaining = value;
  for (let i = 0; i < 8; i++) {
    valueBytes[i] = remaining & 0xff;
    remaining = Math.floor(remaining / 256);
  }

  const scriptBytes = hexToBytes(script);
  const scriptLen = encodeCompactSize(scriptBytes.length);
  const result = new Uint8Array(8 + scriptLen.length + scriptBytes.length);
  result.set(valueBytes, 0);
  result.set(scriptLen, 8);
  result.set(scriptBytes, 8 + scriptLen.length);
  return result;
}

export function parsePriceTerms(
  priceTermsHex: string
): { script: string; value: number; outputs: { script: string; value: number }[] } | null {
  try {
    const bytes = hexToBytes(priceTermsHex);
    if (bytes.length === 0) {
      return null;
    }

    let offset = 0;
    let outputs: { script: string; value: number }[] = [];

    try {
      const count = readCompactSize(bytes, offset);
      offset += count.size;

      for (let i = 0; i < count.value; i++) {
        if (offset + 8 > bytes.length) {
          throw new Error("Invalid output value");
        }

        let value = 0;
        for (let j = 7; j >= 0; j--) {
          value = value * 256 + bytes[offset + j];
        }
        offset += 8;

        const scriptLen = readCompactSize(bytes, offset);
        offset += scriptLen.size;

        if (offset + scriptLen.value > bytes.length) {
          throw new Error("Invalid output script");
        }

        const script = bytesToHex(bytes.slice(offset, offset + scriptLen.value));
        offset += scriptLen.value;
        outputs.push({ script, value });
      }

      if (offset !== bytes.length || outputs.length === 0) {
        throw new Error("Invalid MultiTxOutV1 payload");
      }
    } catch {
      if (bytes.length < 9) {
        return null;
      }

      let value = 0;
      for (let i = 7; i >= 0; i--) {
        value = value * 256 + bytes[i];
      }

      const script = bytesToHex(bytes.slice(8));
      outputs = [{ script, value }];
    }

    return {
      script: outputs[0].script,
      value: outputs[0].value,
      outputs,
    };
  } catch {
    return null;
  }
}

export function encodePriceTerms(script: string, value: number): string {
  return encodePriceTermsOutputs([{ script, value }]);
}

export function encodePriceTermsOutputs(
  outputs: { script: string; value: number }[]
): string {
  const count = encodeCompactSize(outputs.length);
  const encodedOutputs = outputs.map((output) => encodeOutput(output.script, output.value));
  const totalSize =
    count.length + encodedOutputs.reduce((sum, output) => sum + output.length, 0);
  const result = new Uint8Array(totalSize);
  let offset = 0;
  result.set(count, offset);
  offset += count.length;
  for (const output of encodedOutputs) {
    result.set(output, offset);
    offset += output.length;
  }
  return bytesToHex(result);
}

export function assetToSwapTokenId(
  contractType: ContractType,
  glyphRef?: string | null
): string {
  if (contractType === ContractType.RXD || !glyphRef) {
    return "00".repeat(32);
  }

  return Buffer.from(sha256(Buffer.from(Outpoint.fromString(glyphRef).ref(), "hex"))).toString(
    "hex"
  );
}
