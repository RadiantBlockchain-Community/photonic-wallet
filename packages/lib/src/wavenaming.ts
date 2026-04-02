/**
 * Glyph v2 WAVE Naming Integration
 * Reference: Glyph v2 Token Standard Section 19
 */

import { GlyphV2Metadata } from "./v2metadata";
import { GLYPH_NFT, GLYPH_MUT, GLYPH_WAVE } from "./protocols";

/**
 * WAVE name metadata
 */
export type WaveNameMetadata = {
  name: string; // The WAVE name (e.g., "alice")
  domain?: string; // Optional domain (e.g., "rxd")
  target?: string; // What the name resolves to (address, ref, URL)
  target_type?: "address" | "ref" | "url" | "data";
  ttl?: number; // Time-to-live in seconds
  records?: Record<string, string>; // Additional DNS-like records
};

/**
 * Create WAVE name token metadata
 */
export function createWaveName(
  name: string,
  target: string,
  options?: {
    domain?: string;
    target_type?: "address" | "ref" | "url" | "data";
    ttl?: number;
    records?: Record<string, string>;
  }
): GlyphV2Metadata {
  const waveName: WaveNameMetadata = {
    name,
    target,
    domain: options?.domain || "rxd",
    target_type: options?.target_type || "address",
    ttl: options?.ttl,
    records: options?.records,
  };

  return {
    v: 2,
    p: [GLYPH_NFT, GLYPH_MUT, GLYPH_WAVE], // WAVE names must be mutable NFTs
    name: `${name}${options?.domain ? `.${options.domain}` : ""}`,
    type: "wave_name",
    attrs: waveName as any,
  };
}

/**
 * Validate WAVE name token
 */
export function validateWaveName(
  metadata: GlyphV2Metadata
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Must have WAVE protocol
  if (!metadata.p.includes(GLYPH_WAVE)) {
    errors.push("WAVE name metadata must include GLYPH_WAVE protocol");
  }

  // Must have NFT protocol
  if (!metadata.p.includes(GLYPH_NFT)) {
    errors.push("WAVE name must be an NFT");
  }

  // Must have MUT protocol (WAVE names are mutable)
  if (!metadata.p.includes(GLYPH_MUT)) {
    errors.push("WAVE name must be mutable");
  }

  // Validate WAVE name attributes
  if (!metadata.attrs || typeof metadata.attrs !== "object") {
    errors.push("WAVE name metadata missing attrs object");
  } else {
    const waveName = metadata.attrs as WaveNameMetadata;

    if (!waveName.name) {
      errors.push("WAVE name is required");
    } else {
      // Validate name format
      if (!isValidWaveName(waveName.name)) {
        errors.push("Invalid WAVE name format");
      }
    }

    if (!waveName.target) {
      errors.push("WAVE name target is required");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate WAVE name format
 */
export function isValidWaveName(name: string): boolean {
  // WAVE names must be:
  // - 3-63 characters
  // - lowercase alphanumeric and hyphens
  // - cannot start or end with hyphen
  const pattern = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$/;
  return pattern.test(name);
}

/**
 * Resolve WAVE name to target
 */
export function resolveWaveName(
  metadata: GlyphV2Metadata
): { target?: string; target_type?: string; error?: string } {
  const validation = validateWaveName(metadata);
  if (!validation.valid) {
    return { error: validation.errors.join(", ") };
  }

  const waveName = metadata.attrs as WaveNameMetadata;

  return {
    target: waveName.target,
    target_type: waveName.target_type,
  };
}

/**
 * Update WAVE name target (mutable operation)
 */
export function updateWaveNameTarget(
  metadata: GlyphV2Metadata,
  newTarget: string,
  newTargetType?: "address" | "ref" | "url" | "data"
): GlyphV2Metadata {
  if (!metadata.attrs) {
    throw new Error("WAVE name metadata missing attrs");
  }

  const waveName = metadata.attrs as WaveNameMetadata;

  return {
    ...metadata,
    attrs: {
      ...waveName,
      target: newTarget,
      target_type: newTargetType || waveName.target_type,
    } as any,
  };
}

/**
 * Add record to WAVE name
 */
export function addWaveNameRecord(
  metadata: GlyphV2Metadata,
  key: string,
  value: string
): GlyphV2Metadata {
  if (!metadata.attrs) {
    throw new Error("WAVE name metadata missing attrs");
  }

  const waveName = metadata.attrs as WaveNameMetadata;
  const records = { ...(waveName.records || {}) };
  records[key] = value;

  return {
    ...metadata,
    attrs: {
      ...waveName,
      records,
    } as any,
  };
}

/**
 * Get full WAVE name (name.domain)
 */
export function getFullWaveName(metadata: GlyphV2Metadata): string | undefined {
  if (!metadata.attrs) return undefined;

  const waveName = metadata.attrs as WaveNameMetadata;
  if (!waveName.name) return undefined;

  return waveName.domain ? `${waveName.name}.${waveName.domain}` : waveName.name;
}

/**
 * Check if token is a WAVE name
 */
export function isWaveName(metadata: GlyphV2Metadata): boolean {
  return metadata.p.includes(GLYPH_WAVE);
}

/**
 * Search for WAVE name
 * This would typically query an indexer
 */
export type WaveNameSearchResult = {
  name: string;
  ref: string;
  target: string;
  target_type: string;
  owner: string;
};

/**
 * Parse WAVE name from string
 */
export function parseWaveName(
  fullName: string
): { name: string; domain?: string } | undefined {
  const parts = fullName.split(".");

  if (parts.length === 1) {
    return { name: parts[0] };
  } else if (parts.length === 2) {
    return { name: parts[0], domain: parts[1] };
  }

  return undefined;
}

/**
 * Check WAVE name availability
 * This would typically query an indexer
 */
export async function checkWaveNameAvailability(
  name: string,
  domain: string = "rxd"
): Promise<{ available: boolean; owner?: string; ref?: string }> {
  // Placeholder - actual implementation would query indexer
  // For now, just validate format
  if (!isValidWaveName(name)) {
    throw new Error("Invalid WAVE name format");
  }

  return {
    available: true, // Would check indexer
  };
}
