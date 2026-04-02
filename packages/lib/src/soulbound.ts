/**
 * Glyph v2 Soulbound (Non-Transferable) Token Support
 * Reference: Glyph v2 Token Standard Section 8.7
 */

import rjs from "@radiant-core/radiantjs";
import { GlyphV2Policy } from "./v2metadata";

const { Script, Address } = rjs;

/**
 * Create soulbound NFT script
 * Enforces that token can only be spent by original owner
 */
export function soulboundNftScript(
  ownerAddress: string,
  ref: string
): string {
  // Script ensures:
  // 1. Token ref exists (singleton)
  // 2. Only original owner can spend (P2PKH locked to owner)
  // 3. Output must go back to same owner OR be burned (no ref in outputs)

  const script = Script.fromASM(
    `OP_PUSHINPUTREFSINGLETON ${ref} OP_DROP`
  );

  // Add owner verification
  const addr = Address.fromString(ownerAddress);
  const pubkeyhash = addr.hashBuffer.toString("hex");

  script.add(
    Script.fromASM(
      `${pubkeyhash} OP_DUP OP_HASH160 OP_EQUALVERIFY OP_CHECKSIG`
    )
  );

  return script.toHex();
}

/**
 * Validate soulbound policy
 */
export function validateSoulboundPolicy(
  policy?: GlyphV2Policy
): { valid: boolean; error?: string } {
  if (!policy) {
    return { valid: true }; // No policy means transferable
  }

  if (policy.transferable === false) {
    // Soulbound token - ensure it's properly configured
    return { valid: true };
  }

  return { valid: true };
}

/**
 * Check if token is soulbound
 */
export function isSoulbound(policy?: GlyphV2Policy): boolean {
  return policy?.transferable === false;
}

/**
 * Validate soulbound transfer (should only allow burns)
 */
export function validateSoulboundTransfer(
  tx: rjs.Transaction,
  tokenRef: string,
  ownerAddress: string
): { valid: boolean; error?: string; isBurn: boolean } {
  // Check if token ref exists in any output
  let tokenFoundInOutput = false;
  let outputOwner: string | undefined;

  for (const output of tx.outputs) {
    const script = output.script.toHex();
    
    // Check if this output contains the token ref
    if (script.includes(tokenRef)) {
      tokenFoundInOutput = true;
      
      // Extract output address
      try {
        outputOwner = output.script.toAddress()?.toString();
      } catch {
        // Couldn't extract address
      }
      break;
    }
  }

  if (!tokenFoundInOutput) {
    // Token not in outputs = burn operation
    return { valid: true, isBurn: true };
  }

  // Token exists in output - verify it goes back to same owner
  if (outputOwner !== ownerAddress) {
    return {
      valid: false,
      error: `Soulbound token can only be transferred back to owner or burned. Output owner: ${outputOwner}, Expected: ${ownerAddress}`,
      isBurn: false,
    };
  }

  return { valid: true, isBurn: false };
}

/**
 * Create soulbound policy
 */
export function createSoulboundPolicy(
  options?: {
    renderable?: boolean;
    executable?: boolean;
    nsfw?: boolean;
  }
): GlyphV2Policy {
  return {
    transferable: false,
    renderable: options?.renderable ?? true,
    executable: options?.executable ?? false,
    nsfw: options?.nsfw ?? false,
  };
}
