/* eslint-disable @typescript-eslint/ban-ts-comment */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";
import rjs from "@radiantblockchain/radiantjs";
import { Buffer } from "buffer";
import { UnfinalizedOutput, Utxo } from "./types";
import { parseNftScript } from "./script";

// ESM compatibility
const { Script, PrivateKey, Transaction, crypto } = rjs;
type Script = rjs.Script;

export const buildTx = (
  address: string,
  wif: string | string[],
  inputs: Utxo[],
  outputs: UnfinalizedOutput[],
  addChangeOutput = true,
  setInputScriptCallback?: (index: number, script: Script) => Script | void,
  sighashFlags?: number,
  skipFeeCheck?: boolean
) => {
  const tx = new Transaction();
  const p2pkh = Script.fromAddress(address).toHex();

  // Keys can be given as an array if inputs are from different addresses
  const privKeys = (Array.isArray(wif) ? wif : [wif]).map(PrivateKey.fromWIF);

  inputs.forEach((input, index) => {
    if (input.script) {
      tx.addInput(
        new Transaction.Input({
          prevTxId: input.txid,
          outputIndex: input.vout,
          script: new Script(),
          output: new Transaction.Output({
            script: input.script,
            satoshis: input.value,
          }),
        })
      );
      // @ts-ignore
      tx.setInputScript(index, (tx, output) => {
        const privKey = privKeys[index] || privKeys[0];
        const sigType =
          (sighashFlags || crypto.Signature.SIGHASH_ALL) |
          crypto.Signature.SIGHASH_FORKID; // Always enforce fork id
        const sig = Transaction.Sighash.sign(
          tx,
          privKey,
          sigType,
          index,
          output.script,
          // Pass value as string to get around bn.js safe number limit
          // @ts-ignore
          new crypto.BN(`${output.satoshis}`)
        );
        const spendScript = Script.empty()
          .add(Buffer.concat([sig.toBuffer(), Buffer.from([sigType])]))
          .add(privKey.toPublicKey().toBuffer());
        if (setInputScriptCallback) {
          // TODO refactor uses of this to only use return value
          const script = setInputScriptCallback(index, spendScript);
          if (script) {
            return script.toString();
          }
        }
        return spendScript.toString();
      });
    } else {
      tx.from({
        // privKey,
        address,
        txId: input.txid,
        outputIndex: input.vout,
        script: p2pkh,
        satoshis: input.value,
      });
    }
  });

  outputs.forEach(({ script, value }) => {
    tx.addOutput(
      new Transaction.Output({
        script,
        satoshis: value,
      })
    );
  });
  if (addChangeOutput) {
    tx.change(address);
  }
  tx.sign(privKeys[0]);
  tx.seal();

  if (!skipFeeCheck) {
    feeCheck(tx, 20000);
  }

  return tx;
};

export function txId(tx: string) {
  return bytesToHex(
    Buffer.from(sha256(sha256(Buffer.from(tx, "hex")))).reverse()
  );
}

// Fee check to prevent unfortunate bugs
export function feeCheck(tx: rjs.Transaction, feeRate: number) {
  const size = tx.toString().length / 2;
  const expected = size * feeRate;
  const actual = tx.getFee();

  // No greater than 20% more than expected
  if (actual > expected && !((actual - expected) / expected < 0.2)) {
    throw new Error("Failed fee check");
  }
}

export function findTokenOutput(
  tx: rjs.Transaction,
  refLE: string,
  parseFn: (script: string) => Partial<{ ref: string }> = parseNftScript
) {
  const vout = tx.outputs.findIndex((output) => {
    const { ref } = parseFn(output.script.toHex());
    return ref === refLE;
  });

  if (vout >= 0) {
    return { vout, output: tx.outputs[vout] };
  }

  return { index: undefined, output: undefined };
}
