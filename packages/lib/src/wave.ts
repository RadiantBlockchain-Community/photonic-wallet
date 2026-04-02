/**
 * Glyph v2 WAVE Name Convenience API
 * Wraps wavenaming.ts with app-friendly helpers
 */

import { GlyphV2Metadata } from "./v2metadata";
import { GLYPH_NFT, GLYPH_MUT, GLYPH_WAVE } from "./protocols";
import { isValidWaveName } from "./wavenaming";

/**
 * Validate a full WAVE name string (e.g., "alice.rxd")
 */
export function validateWaveName(
  fullName: string
): { valid: boolean; error?: string } {
  if (!fullName) {
    return { valid: false, error: "Name is required" };
  }

  const parts = fullName.split(".");
  const name = parts[0];

  if (!name || name.length < 3) {
    return { valid: false, error: "Name must be at least 3 characters" };
  }

  if (name.length > 63) {
    return { valid: false, error: "Name must be 63 characters or less" };
  }

  if (!isValidWaveName(name)) {
    return {
      valid: false,
      error: "Name must be lowercase alphanumeric and hyphens, cannot start/end with hyphen",
    };
  }

  return { valid: true };
}

/**
 * Calculate registration cost based on name length
 * Shorter names cost more (in photons/satoshis)
 */
export function calculateNameCost(fullName: string): number {
  const name = fullName.split(".")[0];
  if (!name) return 0;

  const len = name.length;

  // Pricing tiers (in photons)
  if (len <= 3) return 100_000_000; // 1 RXD
  if (len <= 5) return 50_000_000;  // 0.5 RXD
  if (len <= 8) return 10_000_000;  // 0.1 RXD
  if (len <= 12) return 5_000_000;  // 0.05 RXD
  return 1_000_000;                  // 0.01 RXD
}

/**
 * Create WAVE name token metadata for minting
 */
export function createWaveNameMetadata(
  fullName: string,
  ownerAddress: string,
  options?: {
    target?: string;
    desc?: string;
    expires?: number;
    data?: Record<string, unknown>;
  }
): GlyphV2Metadata {
  const parts = fullName.split(".");
  const name = parts[0];
  const domain = parts[1] || "rxd";

  return {
    v: 2,
    p: [GLYPH_NFT, GLYPH_MUT, GLYPH_WAVE],
    name: fullName,
    desc: options?.desc,
    type: "wave_name",
    attrs: {
      name,
      domain,
      target: options?.target || ownerAddress,
      target_type: "address",
      ...(options?.expires && { expires: options.expires }),
      ...(options?.data && { records: options.data }),
    } as any,
  };
}
