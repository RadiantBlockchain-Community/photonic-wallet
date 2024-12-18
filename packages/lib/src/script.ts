//import { Address, Opcode, Script } from "@radiantblockchain/radiantjs";
import rjs from "@radiantblockchain/radiantjs";
import { sha256 } from "@noble/hashes/sha256";
import { Buffer } from "buffer";
import { glyphMagicBytesBuffer, glyphMagicBytesHex } from "./token";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { TokenContractType } from "./types";
import {
  bigIntToVmNumber,
  encodeDataPush,
  numberToBinUint32LEClamped,
} from "@bitauth/libauth";

const { Address, Opcode, Script } = rjs;

// NOTE: All ref inputs for script functions must be little-endian

// Size of scripts (not including length VarInt)
export const p2pkhScriptSize = 25;
export const nftScriptSize = 63;
export const ftScriptSize = 75;
export const delegateTokenScriptSize = 63;
export const delegateBurnScriptSize = 42;
export const p2pkhScriptSigSize = 107;
export const mutableNftScriptSize = 175;

const zeroRef = "00".repeat(36);

export function varIntSize(n: number) {
  if (n < 253) {
    return 1;
  } else if (n <= 65535) {
    return 3;
  } else if (n <= 4294967295) {
    return 5;
  } else if (n <= 18446744073709551615n) {
    return 9;
  } else {
    throw new Error("Invalid VarInt");
  }
}

export function pushDataSize(len: number) {
  if (len >= 0 && len < Opcode.OP_PUSHDATA1) {
    return 1;
  } else if (len < Math.pow(2, 8)) {
    return 2;
  } else if (len < Math.pow(2, 16)) {
    return 3;
  } else if (len < Math.pow(2, 32)) {
    return 4;
  }
  throw new Error("Invalid push data length");
}

// Transaction size without scripts (not including input/output script size VarInt and script)
export function baseTxSize(numInputs: number, numOutputs: number) {
  return (
    4 + // version
    varIntSize(numInputs) + // Input count
    (32 + // Prev tx hash
      4 + // Prev tx index
      4) * // Sequence num
      numInputs +
    varIntSize(numOutputs) + // Output count
    8 * // Value
      numOutputs +
    4 // nLockTime
  );
}

// Calcualte size of a transaction, given sizes of input and output scripts
export function txSize(
  inputScriptSizes: number[],
  outputScriptSizes: number[]
) {
  return (
    baseTxSize(inputScriptSizes.length, outputScriptSizes.length) +
    inputScriptSizes.reduce((a, s) => a + varIntSize(s) + s, 0) +
    outputScriptSizes.reduce((a, s) => a + varIntSize(s) + s, 0)
  );
}

export function revealScriptSigSize(glyphMagicBytesLen: number) {
  return p2pkhScriptSigSize + glyphMagicBytesLen;
}

export function commitScriptSize(
  contract: TokenContractType,
  hasDelegate: boolean
) {
  const opSize = {
    ft: 9,
    nft: 10,
    dat: 0,
  };
  return 71 + opSize[contract] + (hasDelegate ? 56 : 0);
}

export function scriptHash(hex: string): string {
  return Buffer.from(sha256(Buffer.from(hex, "hex")))
    .reverse()
    .toString("hex");
}

export function p2pkhScript(address: string): string {
  try {
    return Script.buildPublicKeyHashOut(address).toHex();
  } catch {
    return "";
  }
}

// Handles p2pkh and p2sh
export function payToScript(address: string): string {
  try {
    return Script.fromAddress(address).toHex();
  } catch {
    return "";
  }
}

export function isP2pkh(address: string): boolean {
  try {
    const addr = new Address(address);
    // @ts-expect-error missing definition
    return addr.isPayToPublicKeyHash();
  } catch {
    return false;
  }
}

export function p2pkhScriptHash(address: string): string {
  return scriptHash(p2pkhScript(address));
}

// Delegate ref is used for assigning related refs to the token
// The delegate burn code script hash must be in an output. This output will prove the delegate ref exists in an input.
function addDelegateRefScript(
  script: rjs.Script,
  delegateRef: string
): rjs.Script {
  script.add(
    Script.fromASM(
      `OP_PUSHINPUTREF ${delegateRef} OP_DUP ` +
        `OP_REFOUTPUTCOUNT_OUTPUTS OP_0 OP_NUMEQUALVERIFY ` + // Push ref disallowed
        `d1 OP_SWAP 6a0364656c OP_CAT OP_CAT OP_HASH256 OP_CODESCRIPTHASHOUTPUTCOUNT_OUTPUTS OP_1 OP_NUMEQUALVERIFY` // Ref must be burned using REQUIREINPUTREF RETURN
    )
  );
  return script;
}

export function ftCommitScript(
  address: string,
  payloadHash: string,
  delegateRef: string | undefined
) {
  const script = new Script();

  if (delegateRef) {
    addDelegateRefScript(script, delegateRef);
  }

  // Check payload hash
  script
    .add(Opcode.OP_HASH256)
    .add(Buffer.from(payloadHash, "hex"))
    .add(Opcode.OP_EQUALVERIFY);
  // gly
  script.add(glyphMagicBytesBuffer).add(Opcode.OP_EQUALVERIFY);
  // Ensure normal ref for this input exists in an output
  // TODO should supply be enforced? Maybe not since output can be a PoW mint contract which doesn't provide photon supply
  script.add(
    Script.fromASM(
      "OP_INPUTINDEX OP_OUTPOINTTXHASH OP_INPUTINDEX OP_OUTPOINTINDEX OP_4 OP_NUM2BIN OP_CAT OP_REFTYPE_OUTPUT OP_1 OP_NUMEQUALVERIFY"
    )
  );

  // P2PKH
  script.add(Script.buildPublicKeyHashOut(Address.fromString(address)));

  return script.toHex();
}

export function nftCommitScript(
  address: string,
  payloadHash: string,
  delegateRef: string | undefined
) {
  const script = new Script();

  if (delegateRef) {
    addDelegateRefScript(script, delegateRef);
  }

  // Check payload hash
  script
    .add(Opcode.OP_HASH256)
    .add(Buffer.from(payloadHash, "hex"))
    .add(Opcode.OP_EQUALVERIFY);
  // gly
  script.add(glyphMagicBytesBuffer).add(Opcode.OP_EQUALVERIFY);
  // Ensure singleton for this input exists in an output
  script.add(
    Script.fromASM(
      "OP_INPUTINDEX OP_OUTPOINTTXHASH OP_INPUTINDEX OP_OUTPOINTINDEX OP_4 OP_NUM2BIN OP_CAT OP_REFTYPE_OUTPUT OP_2 OP_NUMEQUALVERIFY"
    )
  );

  // P2PKH
  script.add(Script.buildPublicKeyHashOut(Address.fromString(address)));

  return script.toHex();
}

// dat is used for data storage. Similar to nft but no singleton is created.
export function datCommitScript(
  address: string,
  payloadHash: string,
  delegateRef: string | undefined
) {
  const script = new Script();

  if (delegateRef) {
    addDelegateRefScript(script, delegateRef);
  }

  // Check payload hash
  script
    .add(Opcode.OP_HASH256)
    .add(Buffer.from(payloadHash, "hex"))
    .add(Opcode.OP_EQUALVERIFY);
  // gly dat
  script
    .add(Buffer.from("dat"))
    .add(Opcode.OP_EQUALVERIFY)
    .add(glyphMagicBytesBuffer)
    .add(Opcode.OP_EQUALVERIFY);

  // P2PKH
  script.add(Script.buildPublicKeyHashOut(Address.fromString(address)));

  return script.toHex();
}

export function nftScript(address: string, ref: string) {
  try {
    const script = Script.fromASM(
      `OP_PUSHINPUTREFSINGLETON ${ref} OP_DROP`
    ).add(Script.buildPublicKeyHashOut(address));
    return script.toHex();
  } catch {
    return "";
  }
}

export function ftScript(address: string, ref: string) {
  const script = Script.buildPublicKeyHashOut(address).add(
    Script.fromASM(
      `OP_STATESEPARATOR OP_PUSHINPUTREF ${ref} OP_REFOUTPUTCOUNT_OUTPUTS OP_INPUTINDEX OP_CODESCRIPTBYTECODE_UTXO OP_HASH256 OP_DUP OP_CODESCRIPTHASHVALUESUM_UTXOS OP_OVER OP_CODESCRIPTHASHVALUESUM_OUTPUTS OP_GREATERTHANOREQUAL OP_VERIFY OP_CODESCRIPTHASHOUTPUTCOUNT_OUTPUTS OP_NUMEQUALVERIFY`
    )
  );
  return script.toHex();
}

export function nftAuthScript(
  address: string,
  ref: string,
  auths: { ref: string; scriptSigHash: string }[]
) {
  if (!auths.length) {
    throw new Error("No auths given");
  }

  const authScript = auths
    .map(
      (auth) => `OP_REQUIREINPUTREF ${auth.ref} ${auth.scriptSigHash} OP_2DROP`
    )
    .join(" ");
  const script = Script.fromASM(
    `${authScript} OP_STATESEPARATOR OP_PUSHINPUTREFSINGLETON ${ref} OP_DROP`
  ).add(Script.buildPublicKeyHashOut(address));
  return script.toHex();
}

export function mutableNftScript(mutableRef: string, payloadHash: string) {
  /* Script sig:
   * gly
   * mod
   * <cbor payload>
   * <contract output index>
   * <ref+hash index in token output>
   * <ref index in token output data summary>
   * <token output index>
   */

  return Script.fromASM(
    [
      `${payloadHash} OP_DROP`, // State
      // Pay to token script
      `OP_STATESEPARATOR OP_PUSHINPUTREFSINGLETON ${mutableRef}`, // Mutable contract ref
      `OP_DUP 20 OP_SPLIT OP_BIN2NUM OP_1SUB OP_4 OP_NUM2BIN OP_CAT`, // Build token ref (mutable ref -1)
      `OP_2 OP_PICK OP_REFDATASUMMARY_OUTPUT OP_4 OP_ROLL 24 OP_MUL OP_SPLIT OP_NIP 24 OP_SPLIT OP_DROP OP_EQUALVERIFY`, // Check token ref exists in token output at given refdatasummary index
      `OP_SWAP OP_STATESCRIPTBYTECODE_OUTPUT OP_ROT OP_SPLIT OP_NIP 45 OP_SPLIT OP_DROP OP_OVER 20 OP_CAT OP_INPUTINDEX OP_INPUTBYTECODE OP_SHA256 OP_CAT OP_EQUALVERIFY`, // Compare ref + scriptsig hash in token output to this script's ref + scriptsig hash
      `OP_2 OP_PICK 6d6f64 OP_EQUAL OP_IF`, // Modify operation
      `OP_OVER OP_CODESCRIPTBYTECODE_OUTPUT OP_INPUTINDEX OP_CODESCRIPTBYTECODE_UTXO OP_EQUALVERIFY`, // Contract script must exist unchanged in output
      `OP_OVER OP_STATESCRIPTBYTECODE_OUTPUT 20 OP_5 OP_PICK OP_HASH256 OP_CAT 75 OP_CAT OP_EQUALVERIFY OP_ELSE`, // State script must contain payload hash
      `OP_2 OP_PICK 736c OP_EQUALVERIFY OP_OVER OP_OUTPUTBYTECODE d8 OP_2 OP_PICK OP_CAT 6a OP_CAT OP_EQUAL OP_OVER OP_REFTYPE_OUTPUT OP_0 OP_NUMEQUAL OP_BOOLOR OP_VERIFY OP_ENDIF`, // Seal operation
      `OP_4 OP_ROLL ${glyphMagicBytesHex} OP_EQUALVERIFY OP_2DROP OP_2DROP OP_1`, // Glyph header
    ].join(" ")
  ).toHex() as string;
}

export function nftScriptHash(address: string) {
  return scriptHash(nftScript(address, zeroRef));
}

export function ftScriptHash(address: string) {
  return scriptHash(ftScript(address, zeroRef));
}

export function parseMutableScript(script: string) {
  // Use RegExp so glyph hex variable can be used
  const pattern = new RegExp(
    `^20([0-9a-f]{64})75bdd8([0-9a-f]{72})7601207f818c54807e5279e2547a0124957f7701247f75887cec7b7f7701457f757801207ec0caa87e885279036d6f64876378eac0e98878ec01205579aa7e01757e8867527902736c8878cd01d852797e016a7e8778da009c9b6968547a03${glyphMagicBytesHex}886d6d51$`
  );
  const [, hash, ref] = script.match(pattern) || [];
  return { hash, ref };
}

export function parseP2pkhScript(script: string): {
  address?: string;
} {
  const pattern = /^76a914([0-9a-f]{40})88ac$/;
  const [, address] = script.match(pattern) || [];
  return { address };
}

export function parseNftScript(script: string): {
  ref?: string;
  address?: string;
} {
  const pattern = /^d8([0-9a-f]{72})7576a914([0-9a-f]{40})88ac$/;
  const [, ref, address] = script.match(pattern) || [];
  return { ref, address };
}

export function parseFtScript(script: string): {
  ref?: string;
  address?: string;
} {
  const pattern =
    /^76a914([0-9a-f]{40})88acbdd0([0-9a-f]{72})dec0e9aa76e378e4a269e69d$/;
  const [, address, ref] = script.match(pattern) || [];
  return { ref, address };
}

export function delegateBaseScript(address: string, refs: string[]) {
  const script = new Script();
  refs?.forEach((rel) => {
    script.add(Script.fromASM(`OP_REQUIREINPUTREF ${rel} OP_DROP`));
  });
  script.add(Script.buildPublicKeyHashOut(Address.fromString(address)));
  return script.toHex();
}

export function delegateTokenScript(address: string, ref: string) {
  const script = Script.fromASM(`OP_PUSHINPUTREF ${ref} OP_DROP`).add(
    Script.buildPublicKeyHashOut(address)
  );
  return script.toHex();
}

export function delegateBurnScript(ref: string) {
  return Script.fromASM(`OP_REQUIREINPUTREF ${ref} OP_RETURN 64656c`).toHex();
}

// TODO use this when burning a *name claim contract instead of a delegate burn
export function contractBurnScript(ref: string) {
  return Script.fromASM(`OP_REQUIREINPUTREF ${ref} OP_RETURN 636f6e`).toHex();
}

export function parseDelegateBaseScript(script: string): string[] {
  const pattern = /^((d1[0-9a-f]{72}75)+).*/; // Don't need to match p2pkh
  const match = script.match(pattern);

  if (match) {
    // Return required refs
    const refs = match[1].match(/.{76}/g);
    if (refs) {
      return refs.map((ref) => ref.substring(2, 74));
    }
  }

  return [];
}

export function parseDelegateBurnScript(script: string): string | undefined {
  const pattern = /^d1([0-9a-f]{72})6a0364656c$/;
  const [, ref] = script.match(pattern) || [];
  return ref;
}

export function parseContractBurnScript(script: string): string | undefined {
  const pattern = /^d1([0-9a-f]{72})6a03636f6e$/;
  const [, ref] = script.match(pattern) || [];
  return ref;
}

export function codeScriptHash(script: string) {
  return bytesToHex(sha256(sha256(hexToBytes(script))));
}

// Push a positive number as a 4 bytes little endian
export function push4bytes(n: number) {
  return bytesToHex(encodeDataPush(numberToBinUint32LEClamped(n)));
}

// Push a number with minimal encoding
export function pushMinimal(n: bigint | number) {
  return bytesToHex(encodeDataPush(bigIntToVmNumber(BigInt(n))));
}

export function pushMinimalAsm(n: bigint | number) {
  return Script.fromHex(pushMinimal(n)).toASM();
}

const MAX_TARGET = 0x7fffffffffffffffn; // Doesn't include starting 00000000
export function dMintDiffToTarget(difficulty: number) {
  return MAX_TARGET / BigInt(difficulty);
}

export function dMintScript(
  height: number,
  contractRef: string,
  tokenRef: string,
  maxHeight: number,
  reward: number,
  target: bigint
) {
  return `${push4bytes(height)}d8${contractRef}d0${tokenRef}${pushMinimal(
    maxHeight
  )}${pushMinimal(reward)}${pushMinimal(
    target
  )}bd5175c0c855797ea8597959797ea87e5a7a7eaabc01147f77587f040000000088817600a269a269577ae500a069567ae600a06901d053797e0cdec0e9aa76e378e4a269e69d7eaa76e47b9d547a818b76537a9c537ade789181547ae6939d635279cd01d853797e016a7e886778de519d547854807ec0eb557f777e5379ec78885379eac0e9885379cc519d75686d7551`;
}
