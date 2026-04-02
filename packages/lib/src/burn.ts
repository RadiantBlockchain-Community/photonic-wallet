/**
 * Glyph v2 Burn Mechanism
 * Reference: Glyph v2 Token Standard Section 12
 */

import rjs from "@radiant-core/radiantjs";
import { encode } from "cbor-x";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import { Buffer } from "buffer";
import { Utxo, UnfinalizedInput, UnfinalizedOutput } from "./types";
import { GLYPH_BURN, GLYPH_FT, GLYPH_NFT } from "./protocols";
import { glyphMagicBytesBuffer } from "./token";
import { p2pkhScript, p2pkhScriptSize, parseFtScript, parseNftScript } from "./script";
import { fundTx } from "./coinSelect";
import { buildTx } from "./tx";
import Outpoint from "./Outpoint";

const { Script, Opcode } = rjs;

export type BurnProof = {
  v: number;
  p: number[];
  action: string;
  token_ref: string;
  amount?: number;
  reason?: string;
};

export type BurnResult = {
  tx: rjs.Transaction;
  txid: string;
  proof: BurnProof;
  photonsReturned: number;
};

/**
 * Create burn proof OP_RETURN output
 */
export function createBurnProof(
  tokenRef: string,
  amount?: number,
  reason?: string
): { script: string; proof: BurnProof } {
  const proof: BurnProof = {
    v: 2,
    p: [GLYPH_BURN],
    action: "burn",
    token_ref: tokenRef,
  };

  if (amount !== undefined) {
    proof.amount = amount;
  }

  if (reason) {
    proof.reason = reason;
  }

  const encodedProof = encode(proof);
  
  // Create OP_RETURN script with magic bytes and proof
  const script = new Script()
    .add(Opcode.OP_RETURN)
    .add(glyphMagicBytesBuffer)
    .add(Buffer.from([0x02])) // Version byte
    .add(Buffer.from([0x06])) // BURN marker
    .add(encodedProof)
    .toHex();

  return { script, proof };
}

/**
 * Burn an NFT token completely
 */
export function burnNft(
  address: string,
  wif: string,
  tokenUtxo: Utxo,
  utxos: Utxo[],
  reason?: string,
  feeRate: number = 10000
): BurnResult {
  // Parse NFT script to get ref
  const { ref } = parseNftScript(tokenUtxo.script);
  if (!ref) {
    throw new Error("Invalid NFT script - cannot extract ref");
  }

  const tokenRef = Outpoint.fromObject(tokenUtxo).toString();
  const { script: burnProofScript, proof } = createBurnProof(tokenRef, undefined, reason);

  const p2pkh = p2pkhScript(address);
  const inputs: UnfinalizedInput[] = [tokenUtxo];
  const outputs: UnfinalizedOutput[] = [
    { script: burnProofScript, value: 0 }, // Burn proof
  ];

  // Fund transaction for fees
  const { funding, change, fee } = fundTx(
    address,
    utxos,
    inputs,
    outputs,
    p2pkh,
    feeRate
  );

  if (fee === 0) {
    throw new Error("Couldn't fund burn transaction");
  }

  inputs.push(...funding);
  outputs.push(...change);

  const tx = buildTx(address, wif, inputs, outputs, false);
  const photonsReturned = tokenUtxo.value + change.reduce((sum, c) => sum + c.value, 0);

  return {
    tx,
    txid: tx.id,
    proof,
    photonsReturned,
  };
}

/**
 * Burn fungible tokens (partial or full)
 */
export function burnFt(
  address: string,
  wif: string,
  tokenUtxo: Utxo,
  amountToBurn: number,
  utxos: Utxo[],
  reason?: string,
  feeRate: number = 10000
): BurnResult {
  // Parse FT script to get ref
  const { ref } = parseFtScript(tokenUtxo.script);
  if (!ref) {
    throw new Error("Invalid FT script - cannot extract ref");
  }

  if (amountToBurn <= 0 || amountToBurn > tokenUtxo.value) {
    throw new Error(`Invalid burn amount. Must be between 1 and ${tokenUtxo.value}`);
  }

  const tokenRef = Outpoint.fromObject(tokenUtxo).toString();
  const { script: burnProofScript, proof } = createBurnProof(tokenRef, amountToBurn, reason);

  const p2pkh = p2pkhScript(address);
  const inputs: UnfinalizedInput[] = [tokenUtxo];
  const outputs: UnfinalizedOutput[] = [
    { script: burnProofScript, value: 0 }, // Burn proof
  ];

  // If partial burn, create output with remaining tokens
  const remainingTokens = tokenUtxo.value - amountToBurn;
  if (remainingTokens > 0) {
    outputs.push({
      script: tokenUtxo.script, // Same FT script
      value: remainingTokens,
    });
  }

  // Fund transaction for fees
  const { funding, change, fee } = fundTx(
    address,
    utxos,
    inputs,
    outputs,
    p2pkh,
    feeRate
  );

  if (fee === 0) {
    throw new Error("Couldn't fund burn transaction");
  }

  inputs.push(...funding);
  outputs.push(...change);

  const tx = buildTx(address, wif, inputs, outputs, false);
  const photonsReturned = change.reduce((sum, c) => sum + c.value, 0);

  return {
    tx,
    txid: tx.id,
    proof,
    photonsReturned,
  };
}

/**
 * Validate a burn transaction
 */
export function validateBurn(
  burnTx: rjs.Transaction,
  expectedTokenRef: string
): { valid: boolean; error?: string; proof?: BurnProof } {
  // Find burn proof output (OP_RETURN)
  const burnOutput = burnTx.outputs.find((output) => {
    const script = output.script;
    return script.chunks.length > 0 && script.chunks[0].opcodenum === Opcode.OP_RETURN;
  });

  if (!burnOutput) {
    return { valid: false, error: "No burn proof output found" };
  }

  // Verify token ref doesn't exist in any output
  const tokenStillExists = burnTx.outputs.some((output) => {
    const nftParse = parseNftScript(output.script.toHex());
    const ftParse = parseFtScript(output.script.toHex());
    const outpointRef = nftParse.ref || ftParse.ref;
    
    if (outpointRef) {
      const outputRef = Outpoint.fromString(outpointRef).toString();
      return outputRef === expectedTokenRef;
    }
    return false;
  });

  if (tokenStillExists) {
    return { valid: false, error: "Token ref still exists in outputs" };
  }

  // Decode burn proof
  try {
    const chunks = burnOutput.script.chunks;
    if (chunks.length < 4) {
      return { valid: false, error: "Invalid burn proof format" };
    }

    // Check magic bytes
    const magicBytes = Buffer.from(chunks[1].buf || []).toString("hex");
    if (magicBytes !== "676c79") {
      return { valid: false, error: "Invalid magic bytes in burn proof" };
    }

    // Check version
    const version = chunks[2].buf?.[0];
    if (version !== 0x02) {
      return { valid: false, error: "Invalid version in burn proof" };
    }

    // Check burn marker
    const burnMarker = chunks[3].buf?.[0];
    if (burnMarker !== 0x06) {
      return { valid: false, error: "Invalid burn marker" };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: `Failed to decode burn proof: ${error}` };
  }
}

/**
 * Parse burn proof from OP_RETURN output
 */
export function parseBurnProof(script: string): BurnProof | undefined {
  try {
    const scriptObj = new Script(script);
    const chunks = scriptObj.chunks;

    if (chunks.length < 5 || chunks[0].opcodenum !== Opcode.OP_RETURN) {
      return undefined;
    }

    // Decode CBOR payload (last chunk)
    const proofData = chunks[4].buf;
    if (!proofData) {
      return undefined;
    }

    const { decode } = require("cbor-x");
    const proof = decode(Buffer.from(proofData)) as BurnProof;

    return proof;
  } catch {
    return undefined;
  }
}
