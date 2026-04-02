/**
 * Glyph v2 Protocol IDs
 * Reference: https://github.com/Radiant-Core/Glyph-Token-Standards
 */

// Base token types
export const GLYPH_FT = 1;        // Fungible Token
export const GLYPH_NFT = 2;       // Non-Fungible Token
export const GLYPH_DAT = 3;       // Data Storage

// Extensions
export const GLYPH_DMINT = 4;     // Decentralized Minting
export const GLYPH_MUT = 5;       // Mutable State
export const GLYPH_BURN = 6;      // Explicit Burn
export const GLYPH_CONTAINER = 7; // Container/Collection
export const GLYPH_ENCRYPTED = 8; // Encrypted Content
export const GLYPH_TIMELOCK = 9;  // Timelocked Reveal
export const GLYPH_AUTHORITY = 10; // Issuer Authority
export const GLYPH_WAVE = 11;     // WAVE Naming

// Protocol names for display
export const PROTOCOL_NAMES: Record<number, string> = {
  [GLYPH_FT]: 'Fungible Token',
  [GLYPH_NFT]: 'Non-Fungible Token',
  [GLYPH_DAT]: 'Data Storage',
  [GLYPH_DMINT]: 'Decentralized Minting',
  [GLYPH_MUT]: 'Mutable State',
  [GLYPH_BURN]: 'Burn',
  [GLYPH_CONTAINER]: 'Container',
  [GLYPH_ENCRYPTED]: 'Encrypted',
  [GLYPH_TIMELOCK]: 'Timelock',
  [GLYPH_AUTHORITY]: 'Authority',
  [GLYPH_WAVE]: 'WAVE Name',
};

// Protocol requirements per Glyph v2 spec Section 3.5
export const PROTOCOL_REQUIREMENTS: Record<number, number[]> = {
  [GLYPH_DMINT]: [GLYPH_FT],
  [GLYPH_MUT]: [GLYPH_NFT],
  [GLYPH_CONTAINER]: [GLYPH_NFT],
  [GLYPH_ENCRYPTED]: [GLYPH_NFT],
  [GLYPH_TIMELOCK]: [GLYPH_ENCRYPTED], // Timelock requires Encrypted
  [GLYPH_AUTHORITY]: [GLYPH_NFT],
  [GLYPH_WAVE]: [GLYPH_NFT, GLYPH_MUT],
};

// Protocols that cannot exist alone (action markers or modifiers)
export const PROTOCOLS_REQUIRE_BASE: number[] = [
  GLYPH_DMINT,
  GLYPH_MUT,
  GLYPH_BURN, // BURN is an action marker
  GLYPH_CONTAINER,
  GLYPH_ENCRYPTED,
  GLYPH_TIMELOCK,
  GLYPH_AUTHORITY,
  GLYPH_WAVE,
];

// Mutually exclusive protocols
export const PROTOCOL_EXCLUSIONS: [number, number][] = [
  [GLYPH_FT, GLYPH_NFT],
];

/**
 * Get human-readable token type from protocols
 */
export function getTokenType(protocols: number[]): string {
  if (protocols.includes(GLYPH_FT)) {
    if (protocols.includes(GLYPH_DMINT)) return 'dMint FT';
    return 'Fungible Token';
  }
  if (protocols.includes(GLYPH_NFT)) {
    if (protocols.includes(GLYPH_WAVE)) return 'WAVE Name';
    if (protocols.includes(GLYPH_AUTHORITY)) return 'Authority';
    if (protocols.includes(GLYPH_CONTAINER)) return 'Container';
    if (protocols.includes(GLYPH_ENCRYPTED)) return 'Encrypted NFT';
    if (protocols.includes(GLYPH_MUT)) return 'Mutable NFT';
    return 'NFT';
  }
  if (protocols.includes(GLYPH_DAT)) return 'Data';
  return 'Unknown';
}

/**
 * Check if protocols include a base type
 */
export function hasBaseType(protocols: number[]): boolean {
  return protocols.includes(GLYPH_FT) || 
         protocols.includes(GLYPH_NFT) || 
         protocols.includes(GLYPH_DAT);
}

/**
 * Validate protocol combination
 */
export function validateProtocols(protocols: number[]): { valid: boolean; error?: string } {
  // Check mutual exclusions
  for (const [a, b] of PROTOCOL_EXCLUSIONS) {
    if (protocols.includes(a) && protocols.includes(b)) {
      return { valid: false, error: `${PROTOCOL_NAMES[a]} and ${PROTOCOL_NAMES[b]} are mutually exclusive` };
    }
  }
  
  // Check requirements
  for (const protocol of protocols) {
    const required = PROTOCOL_REQUIREMENTS[protocol];
    if (required) {
      for (const req of required) {
        if (!protocols.includes(req)) {
          return { valid: false, error: `${PROTOCOL_NAMES[protocol]} requires ${PROTOCOL_NAMES[req]}` };
        }
      }
    }
  }
  
  // Check for protocols that can't exist alone
  if (protocols.length === 1 && PROTOCOLS_REQUIRE_BASE.includes(protocols[0])) {
    return { valid: false, error: `${PROTOCOL_NAMES[protocols[0]]} cannot exist alone` };
  }
  
  // BURN must accompany FT or NFT (it's an action marker, not a token type)
  if (protocols.includes(GLYPH_BURN)) {
    if (!protocols.includes(GLYPH_FT) && !protocols.includes(GLYPH_NFT)) {
      return { valid: false, error: 'Burn must accompany Fungible Token or Non-Fungible Token' };
    }
  }
  
  return { valid: true };
}

/**
 * Check if token is immutable
 */
export function isImmutable(protocols: number[]): boolean {
  return !(protocols.includes(GLYPH_NFT) && protocols.includes(GLYPH_MUT));
}

/**
 * Check if token has royalties
 */
export function hasRoyalty(metadata: { royalty?: { bps?: number } }): boolean {
  return !!metadata.royalty && typeof metadata.royalty.bps === 'number' && metadata.royalty.bps > 0;
}

/**
 * Check if token is encrypted
 */
export function isEncrypted(protocols: number[]): boolean {
  return protocols.includes(GLYPH_ENCRYPTED);
}

/**
 * Check if token is a container
 */
export function isContainer(protocols: number[]): boolean {
  return protocols.includes(GLYPH_CONTAINER);
}
