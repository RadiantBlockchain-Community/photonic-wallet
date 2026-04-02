/**
 * Glyph v2 Metadata Schema Support
 * Reference: Glyph v2 Token Standard Section 8
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { encode } from "cbor-x";
import rjs from "@radiant-core/radiantjs";

const { PrivateKey } = rjs;

/**
 * v2 Content Model - Full structured format
 */
export type GlyphV2ContentFile = {
  path: string;
  mime: string;
  size: number;
  hash: {
    algo: string;
    hex: string;
  };
  encoding?: "raw" | "base64";
  compression?: "none" | "gzip" | "zstd";
  storage: "inline" | "ref" | "ipfs";
  uri?: string; // Required for ref/ipfs storage
  data?: Uint8Array; // For inline storage
};

export type GlyphV2Content = {
  primary?: GlyphV2ContentFile;
  files?: GlyphV2ContentFile[];
  refs?: GlyphV2ContentFile[];
};

/**
 * v2 Preview Model
 */
export type GlyphV2Preview = {
  thumb?: {
    path: string;
    mime: string;
    width?: number;
    height?: number;
    data?: Uint8Array;
  };
  blurhash?: string;
  alt?: string;
};

/**
 * v2 Policy Model
 */
export type GlyphV2Policy = {
  renderable?: boolean;
  executable?: boolean;
  nsfw?: boolean;
  transferable?: boolean; // Soulbound when false
};

/**
 * v2 Rights/Licensing Model
 */
export type GlyphV2Rights = {
  license?: string;
  terms?: string;
  attribution?: string;
};

/**
 * v2 Royalty Model
 */
export type GlyphV2Royalty = {
  enforced: boolean;
  bps: number; // Basis points (500 = 5%)
  address: string;
  minimum?: number; // Minimum royalty in photons
  splits?: Array<{
    address: string;
    bps: number;
  }>;
};

/**
 * v2 Creator Signature
 */
export type GlyphV2Creator = {
  pubkey: string; // 33-byte compressed pubkey, hex
  sig?: string; // Signature over commit hash, hex
  algo?: "ecdsa-secp256k1" | "schnorr-secp256k1";
};

/**
 * v2 Relationships
 */
export type GlyphV2Relationships = {
  container?: {
    ref: string;
    index?: number;
  };
  parent?: string;
  children?: string[];
};

/**
 * v2 Mutable Configuration
 */
export type GlyphV2Mutable = {
  controller?: string; // Pubkey or address
  updateable_fields?: string[];
};

/**
 * v2 Container/Collection
 */
export type GlyphV2Container = {
  type: "collection" | "bundle" | "album";
  max_items?: number;
  minted?: number;
  items?: string[]; // Array of token refs
};

/**
 * v2 Encryption Parameters
 */
export type GlyphV2Crypto = {
  algorithm: "aes-256-gcm" | "chacha20-poly1305";
  key_derivation?: "pbkdf2" | "argon2";
  encrypted_fields?: string[];
  public_key?: string; // For asymmetric encryption
};

/**
 * Complete v2 Metadata Schema
 */
export type GlyphV2Metadata = {
  v: 2;
  type?: string; // Human-readable hint (p array is authoritative)
  p: number[]; // Protocol IDs
  name?: string;
  desc?: string;
  created?: string; // ISO8601 timestamp
  creator?: string | GlyphV2Creator;
  content?: GlyphV2Content;
  preview?: GlyphV2Preview;
  policy?: GlyphV2Policy;
  rights?: GlyphV2Rights;
  rels?: GlyphV2Relationships;
  mutable?: GlyphV2Mutable;
  royalty?: GlyphV2Royalty;
  container?: GlyphV2Container;
  crypto?: GlyphV2Crypto;
  commit_outpoint?: string; // txid:vout
  [key: string]: unknown; // Allow custom fields
};

/**
 * Normalize v1 shorthand to v2 full content model
 */
export function normalizeV1ToV2Content(
  main?: { t: string; b: Uint8Array }
): GlyphV2Content | undefined {
  if (!main) return undefined;

  const hash = bytesToHex(sha256(main.b));

  return {
    primary: {
      path: "main",
      mime: main.t,
      size: main.b.length,
      hash: {
        algo: "sha256",
        hex: hash,
      },
      storage: "inline",
      data: main.b,
    },
  };
}

/**
 * Convert v2 content model to v1 shorthand (for backwards compatibility)
 */
export function convertV2ToV1Shorthand(
  content?: GlyphV2Content
): { t: string; b: Uint8Array } | undefined {
  if (!content?.primary) return undefined;

  const primary = content.primary;
  if (primary.storage !== "inline" || !primary.data) {
    return undefined;
  }

  return {
    t: primary.mime,
    b: primary.data,
  };
}

/**
 * Create creator signature for metadata
 */
export function signMetadata(
  metadata: GlyphV2Metadata,
  privateKey: string | rjs.PrivateKey,
  algorithm: "ecdsa-secp256k1" | "schnorr-secp256k1" = "ecdsa-secp256k1"
): GlyphV2Metadata {
  const privKey = typeof privateKey === "string" 
    ? PrivateKey.fromWIF(privateKey) 
    : privateKey;

  const pubkey = privKey.toPublicKey().toString();

  // Create metadata copy with empty signature
  const metadataForHash = {
    ...metadata,
    creator: {
      pubkey,
      sig: "",
      algo: algorithm,
    },
  };

  // Compute commit hash
  const encoded = encode(metadataForHash);
  const commitHash = sha256(sha256(encoded));

  // Create message to sign
  const prefix = Buffer.from("glyph-v2-creator:", "utf-8");
  const message = sha256(Buffer.concat([prefix, commitHash]));

  // Sign message
  const sig = (privKey as any).sign(Buffer.from(message));

  // Return metadata with signature
  return {
    ...metadata,
    creator: {
      pubkey,
      sig: sig.toString("hex"),
      algo: algorithm,
    },
  };
}

/**
 * Verify creator signature
 */
export function verifyCreatorSignature(
  metadata: GlyphV2Metadata
): { valid: boolean; error?: string } {
  if (typeof metadata.creator !== "object" || !metadata.creator.sig) {
    return { valid: false, error: "No creator signature present" };
  }

  const creator = metadata.creator as GlyphV2Creator;

  try {
    // Create metadata copy with empty signature
    const metadataForHash = {
      ...metadata,
      creator: {
        pubkey: creator.pubkey,
        sig: "",
        algo: creator.algo,
      },
    };

    // Compute commit hash
    const encoded = encode(metadataForHash);
    const commitHash = sha256(sha256(encoded));

    // Create message
    const prefix = Buffer.from("glyph-v2-creator:", "utf-8");
    const message = sha256(Buffer.concat([prefix, commitHash]));

    // Verify signature
    const pubKey = rjs.PublicKey.fromString(creator.pubkey);
    const signature = rjs.crypto.Signature.fromString(creator.sig!);
    const valid = rjs.crypto.ECDSA.verify(
      Buffer.from(message),
      signature,
      pubKey
    );

    return { valid };
  } catch (error) {
    return { valid: false, error: `Signature verification failed: ${error}` };
  }
}

/**
 * Validate v2 metadata schema
 */
export function validateV2Metadata(
  metadata: GlyphV2Metadata
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required fields
  if (metadata.v !== 2) {
    errors.push("Version must be 2");
  }

  if (!Array.isArray(metadata.p) || metadata.p.length === 0) {
    errors.push("Protocol array (p) is required and must not be empty");
  }

  // Field size limits
  if (metadata.name && metadata.name.length > 256) {
    errors.push("Name exceeds 256 bytes");
  }

  if (metadata.desc && metadata.desc.length > 4096) {
    errors.push("Description exceeds 4KB");
  }

  // Content validation
  if (metadata.content) {
    if (metadata.content.primary) {
      const primary = metadata.content.primary;
      if (!primary.path || !primary.mime || !primary.size || !primary.hash || !primary.storage) {
        errors.push("Content primary file missing required fields");
      }
    }
  }

  // Royalty validation
  if (metadata.royalty) {
    if (typeof metadata.royalty.bps !== "number" || metadata.royalty.bps < 0 || metadata.royalty.bps > 10000) {
      errors.push("Royalty bps must be between 0 and 10000");
    }
    if (!metadata.royalty.address) {
      errors.push("Royalty address is required when royalty is specified");
    }
  }

  // Policy validation
  if (metadata.policy?.transferable === false) {
    // Soulbound token - ensure it's an NFT
    if (!metadata.p.includes(2)) {
      errors.push("Non-transferable (soulbound) tokens must be NFTs");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Create v2 metadata with defaults
 */
export function createV2Metadata(
  protocols: number[],
  options: Partial<GlyphV2Metadata> = {}
): GlyphV2Metadata {
  return {
    v: 2,
    p: protocols,
    created: new Date().toISOString(),
    ...options,
  };
}

/**
 * Compute canonical commit hash for v2 metadata
 */
export function computeCommitHash(metadata: GlyphV2Metadata): string {
  const encoded = encode(metadata);
  return bytesToHex(sha256(sha256(encoded)));
}
