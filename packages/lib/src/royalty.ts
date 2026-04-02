/**
 * Glyph v2 On-Chain Royalty Enforcement
 * Reference: Glyph v2 Token Standard Section 13 and REP-3012
 */

import rjs from "@radiant-core/radiantjs";
import { GlyphV2Royalty } from "./v2metadata";
import { nftScript } from "./script";

const { Script, Opcode } = rjs;

/**
 * Create royalty-enforced NFT script
 * Enforces royalty payments at the script level
 */
export function nftRoyaltyScript(
  address: string,
  ref: string,
  royalty: GlyphV2Royalty
): string {
  if (!royalty.enforced) {
    // Non-enforced royalties use standard NFT script
    return nftScript(address, ref);
  }

  // Build royalty enforcement script
  // This script validates that royalty outputs exist with correct amounts
  const script = Script.fromASM(
    `OP_PUSHINPUTREFSINGLETON ${ref} OP_DROP`
  );

  // Add royalty validation logic
  // Output 0: NFT to buyer
  // Output 1: Seller payment
  // Output 2+: Royalty payments

  if (royalty.splits && royalty.splits.length > 0) {
    // Multiple royalty recipients
    royalty.splits.forEach((split, index) => {
      const outputIndex = 2 + index;
      script.add(
        Script.fromASM(
          `${outputIndex} OP_OUTPUTBYTECODE ` +
          `OP_DUP OP_HASH160 ${addressToHash160(split.address)} OP_EQUALVERIFY ` +
          `${outputIndex} OP_OUTPUTVALUE ` +
          `OP_1 OP_OUTPUTVALUE ${split.bps} OP_MUL 10000 OP_DIV ` +
          `OP_GREATERTHANOREQUAL OP_VERIFY`
        )
      );
    });
  } else {
    // Single royalty recipient
    script.add(
      Script.fromASM(
        `OP_2 OP_OUTPUTBYTECODE ` +
        `OP_DUP OP_HASH160 ${addressToHash160(royalty.address)} OP_EQUALVERIFY ` +
        `OP_2 OP_OUTPUTVALUE ` +
        `OP_1 OP_OUTPUTVALUE ${royalty.bps} OP_MUL 10000 OP_DIV ` +
        `OP_GREATERTHANOREQUAL OP_VERIFY`
      )
    );
  }

  // Add P2PKH spending condition
  script.add(Script.buildPublicKeyHashOut(address));

  return script.toHex();
}

/**
 * Calculate royalty amount
 */
export function calculateRoyalty(
  salePrice: number,
  royalty: GlyphV2Royalty
): number {
  const royaltyAmount = Math.floor((salePrice * royalty.bps) / 10000);
  
  if (royalty.minimum && royaltyAmount < royalty.minimum) {
    return royalty.minimum;
  }

  return royaltyAmount;
}

/**
 * Validate royalty payment in transaction
 */
export function validateRoyaltyPayment(
  tx: rjs.Transaction,
  royalty: GlyphV2Royalty,
  salePrice: number
): { valid: boolean; error?: string } {
  if (!royalty.enforced) {
    return { valid: true }; // Non-enforced royalties are advisory
  }

  const requiredRoyalty = calculateRoyalty(salePrice, royalty);

  if (royalty.splits && royalty.splits.length > 0) {
    // Validate split payments
    for (let i = 0; i < royalty.splits.length; i++) {
      const split = royalty.splits[i];
      const outputIndex = 2 + i;

      if (outputIndex >= tx.outputs.length) {
        return { valid: false, error: `Missing royalty output ${outputIndex}` };
      }

      const output = tx.outputs[outputIndex];
      const expectedAmount = Math.floor((salePrice * split.bps) / 10000);

      if (output.satoshis < expectedAmount) {
        return {
          valid: false,
          error: `Royalty payment ${i} insufficient: ${output.satoshis} < ${expectedAmount}`,
        };
      }

      // Validate recipient address
      const outputAddress = output.script.toAddress()?.toString();
      if (outputAddress !== split.address) {
        return {
          valid: false,
          error: `Royalty recipient ${i} mismatch: ${outputAddress} != ${split.address}`,
        };
      }
    }
  } else {
    // Validate single royalty payment
    if (tx.outputs.length < 3) {
      return { valid: false, error: "Missing royalty output" };
    }

    const royaltyOutput = tx.outputs[2];

    if (royaltyOutput.satoshis < requiredRoyalty) {
      return {
        valid: false,
        error: `Royalty payment insufficient: ${royaltyOutput.satoshis} < ${requiredRoyalty}`,
      };
    }

    // Validate recipient address
    const outputAddress = royaltyOutput.script.toAddress()?.toString();
    if (outputAddress !== royalty.address) {
      return {
        valid: false,
        error: `Royalty recipient mismatch: ${outputAddress} != ${royalty.address}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Helper to convert address to hash160
 */
function addressToHash160(address: string): string {
  try {
    const addr = new rjs.Address(address);
    return addr.hashBuffer.toString("hex");
  } catch {
    throw new Error(`Invalid address: ${address}`);
  }
}

/**
 * Create royalty metadata
 */
export function createRoyalty(
  address: string,
  basisPoints: number,
  enforced: boolean = false,
  options?: {
    minimum?: number;
    splits?: Array<{ address: string; bps: number }>;
  }
): GlyphV2Royalty {
  if (basisPoints < 0 || basisPoints > 10000) {
    throw new Error("Basis points must be between 0 and 10000");
  }

  const royalty: GlyphV2Royalty = {
    enforced,
    bps: basisPoints,
    address,
  };

  if (options?.minimum) {
    royalty.minimum = options.minimum;
  }

  if (options?.splits) {
    // Validate splits sum to total bps
    const totalSplitBps = options.splits.reduce((sum, s) => sum + s.bps, 0);
    if (totalSplitBps !== basisPoints) {
      throw new Error(`Split basis points (${totalSplitBps}) must equal total (${basisPoints})`);
    }
    royalty.splits = options.splits;
  }

  return royalty;
}
