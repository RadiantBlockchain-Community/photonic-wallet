// ESM compatibility
import rjs from "@radiantblockchain/radiantjs";

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
};

export type RevealPsbtParams = {
  photons: number;
  address: string;
};

export type TokenRevealParams =
  | RevealDirectParams
  | RevealDmintParams
  | RevealPsbtParams;

export type SmartTokenPayload = {
  p: (string | number)[];
  in?: Uint8Array[];
  by?: Uint8Array[];
  attrs?: {
    [key: string]: unknown;
  };
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
