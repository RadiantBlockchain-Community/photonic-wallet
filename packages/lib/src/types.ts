// ESM compatibility
import rjs from "@radiant-core/radiantjs";

/**
 * Glyph v2 Token Standard Constants
 * Reference: https://github.com/Radiant-Core/Glyph-Token-Standards
 */

// Glyph magic bytes
export const GLYPH_MAGIC = Buffer.from('gly', 'ascii');
export const GLYPH_MAGIC_HEX = '676c79';

// Protocol version
export const GLYPH_VERSION = {
  V1: 0x01,
  V2: 0x02,
} as const;

// Protocol IDs per Glyph v2 spec
export const GlyphProtocol = {
  GLYPH_FT: 1,        // Fungible Token
  GLYPH_NFT: 2,       // Non-Fungible Token
  GLYPH_DAT: 3,       // Data Storage
  GLYPH_DMINT: 4,     // Decentralized Minting
  GLYPH_MUT: 5,       // Mutable State
  GLYPH_BURN: 6,      // Explicit Burn
  GLYPH_CONTAINER: 7, // Container/Collection
  GLYPH_ENCRYPTED: 8, // Encrypted Content
  GLYPH_TIMELOCK: 9,  // Timelocked Reveal
  GLYPH_AUTHORITY: 10, // Issuer Authority
  GLYPH_WAVE: 11,     // WAVE Naming
} as const;

export type GlyphProtocolId = typeof GlyphProtocol[keyof typeof GlyphProtocol];

// Algorithm IDs per Glyph v2 dMint spec (REP-3010)
export const DmintAlgorithmId = {
  SHA256D: 0x00,
  BLAKE3: 0x01,
  K12: 0x02,
  ARGON2ID_LIGHT: 0x03,
  RANDOMX_LIGHT: 0x04,
} as const;

// DAA Mode IDs per Glyph v2 dMint spec
export const DaaModeId = {
  FIXED: 0x00,
  EPOCH: 0x01,
  ASERT: 0x02,
  LWMA: 0x03,
  SCHEDULE: 0x04,
} as const;

export type NetworkKey = "mainnet" | "testnet";

export type Wallet = {
  privKey: rjs.PrivateKey;
  wif: string;
  address: string;
};

export type DeployMethod = "direct" | "psbt" | "dmint";

export type RevealDirectParams = {
  address: string;
};

export type RevealDmintParams = {
  address: string;
  difficulty: number;
  numContracts: number;
  maxHeight: number;
  reward: number;
  premine: number;
  algorithm?: string; // 'sha256d', 'blake3', 'k12'
  daaMode?: string;    // 'fixed', 'epoch', 'asert', 'lwma', 'schedule'
  daaParams?: any;     // Parameters for DAA (e.g., schedule array)
};

export type RevealPsbtParams = {
  photons: number;
  address: string;
};

export type TokenRevealParams =
  | RevealDirectParams
  | RevealDmintParams
  | RevealPsbtParams;

export type DmintPayload = {
  algo: number;           // Algorithm ID: 0x00=sha256d, 0x01=blake3, 0x02=k12
  numContracts: number;   // Number of mining contracts
  maxHeight: number;
  reward: number;
  premine: number;
  diff: number;
  daa?: {
    mode: number;         // DAA mode: 0x00=fixed, 0x01=epoch, 0x02=asert, 0x03=lwma, 0x04=schedule
    targetBlockTime: number;
    halfLife?: number;    // For ASERT
    asymptote?: number;   // For ASERT
    windowSize?: number;  // For LWMA
    epochLength?: number; // For Epoch
    maxAdjustment?: number; // For Epoch
    schedule?: { height: number; difficulty: number }[]; // For Schedule
  };
};

export type SmartTokenPayload = {
  v?: number;             // Glyph version (2 for v2)
  p: (string | number)[];
  in?: Uint8Array[];
  by?: Uint8Array[];
  attrs?: {
    [key: string]: unknown;
  };
  dmint?: DmintPayload;   // dMint configuration per v2 spec
  [key: string]: unknown;
};

export type SmartTokenEmbeddedFile = {
  t: string;
  b: Uint8Array;
};

export type SmartTokenRemoteFile = {
  t: string;
  u: string;
  h?: Uint8Array;
  hs?: Uint8Array;
};

export type SmartTokenFile = SmartTokenEmbeddedFile | SmartTokenRemoteFile;

export type TokenContractType = "nft" | "dat" | "ft";

// Unsigned inputs are used for fee calcualtion and do not yet have a script sig
// Maybe there is a better name for this...
export type UnfinalizedInput = Utxo & {
  scriptSigSize?: number;
  scriptSig?: string;
};

// Unsigned outputs are used for fee calcualtion and do not yet contain a txid and vout
// Maybe there is a better name for this...
export type UnfinalizedOutput = {
  script: string;
  value: number;
};

export type Utxo = {
  txid: string;
  vout: number;
  script: string;
  value: number;
};

export type ElectrumUtxo = {
  tx_hash: string;
  tx_pos: number;
  height: number;
  value: number;
  refs: { ref: string; type: "normal" | "single" }[];
};

export type ElectrumRefResponse = [
  { tx_hash: string; height: number },
  { tx_hash: string; height: number }
];

export type ElectrumTxResponse = {
  hex: string;
  hash: string;
  time: number;
};

export type ElectrumBalanceResponse = {
  confirmed: number;
  unconfirmed: number;
};

export type ElectrumHeaderResponse = {
  height: number;
  hex: string;
};

export type ElectrumHeadersResponse = {
  count: number;
  hex: string;
  max: number;
};

export type TokenMint = {
  utxo: {
    txid: string;
    vout: number;
    script: string;
    value: number;
  };
  immutable: boolean;
  outputValue: number;
  contract: TokenContractType;
  revealScriptSig: string;
  payloadHash: string;
};

export default {};
