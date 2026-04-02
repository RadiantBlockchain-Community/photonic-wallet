import rjs from "@radiant-core/radiantjs";
import {
  mnemonicToEntropy,
  mnemonicToSeed,
  mnemonicToSeedSync,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { HDKey } from "@scure/bip32";
import { bytesToHex } from "@noble/hashes/utils";
import { Wallet } from "./types";

const derivationPath = "m/44'/0'/0'/0/0";

// ESM compatibility
const { Networks, PrivateKey } = rjs;

export async function tryMnemonic(mnemonic: string) {
  return mnemonicToSeed(mnemonic);
}

export async function importMnemonic(mnemonic: string) {
  return mnemonicToEntropy(mnemonic, wordlist);
}

export async function walletFromMnemonic(
  mnemonic: string,
  net: "mainnet" | "testnet"
): Promise<Wallet> {
  const seed = mnemonicToSeedSync(mnemonic);
  const hdKey = HDKey.fromMasterSeed(seed);
  const key = bytesToHex(hdKey.derive(derivationPath).privateKey as Uint8Array);
  if (!key) {
    throw new Error("Invalid mnemonic phrase");
  }
  const privKey = new PrivateKey(key, Networks[net]);
  const address = privKey?.toAddress().toString() as string;

  return {
    privKey,
    wif: privKey.toString(),
    address,
  };
}

export async function getAddress(key: string, net: "mainnet" | "testnet") {
  const privKey = new PrivateKey(key, Networks[net]);
  return privKey?.toAddress().toString() as string;
}
