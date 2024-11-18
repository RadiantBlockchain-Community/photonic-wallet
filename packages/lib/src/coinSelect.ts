/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore
import bsvCoinSelect from "bsv-coinselect";
import { UnfinalizedInput, UnfinalizedOutput, Utxo } from "./types";

export type SelectableInput = UnfinalizedInput & {
  required?: boolean;
  utxo?: unknown;
};

// Convert a target object to a UTXO with txid and vout properties
export const targetToUtxo = (
  target: UnfinalizedOutput[],
  txid: string,
  voutStart = 0
): Utxo[] =>
  target.map((t, i) => ({
    txid: txid,
    vout: voutStart + i,
    ...t,
  }));

export function coinSelect(
  address: string,
  utxos: SelectableInput[],
  target: {
    script: string;
    value: number;
  }[],
  changeScript: string,
  feeRate: number
): {
  inputs: SelectableInput[];
  outputs: UnfinalizedInput[];
  fee: number;
  remaining: SelectableInput[];
} {
  const inputs = utxos.map((u) => ({
    address,
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    // height:  // FIXME
    required: u.required || false,
    // Coinselect uses script as scriptSig, but for Utxo it's scriptPubKey
    script: u.scriptSig,
    // scriptPubKey is not used by coinselect, but will be swapped back to the script property later
    scriptPubKey: u.script,
    // Store the original UTXO so properties such as id can be preseved
    utxo: u,
  }));

  const selected = bsvCoinSelect(inputs, target, feeRate, changeScript);
  if (!selected.inputs?.length) {
    return selected;
  }
  selected.inputs = (selected.inputs as { scriptPubKey: string }[]).map(
    ({ scriptPubKey, ...rest }) => ({
      ...rest,
      script: scriptPubKey,
    })
  );
  // Remove spent UTXOs
  const remaining = utxos.filter(
    ({ utxo }) =>
      !(selected.inputs as SelectableInput[]).some(
        (input) => input.utxo === utxo
      )
  );
  selected.remaining = remaining;
  return selected;
}

/**
 * Select coins to fund a transaction
 * This is used to create a separate funding transaction which will be used to fund the next transaction
 * Returns:
 * - Funding UTXOs
 * - Unspent outputs with funding UTXOs removed
 * - Change UTXO
 * - Fee
 */
export function fundTx(
  address: string,
  utxos: UnfinalizedInput[],
  requiredInputs: UnfinalizedInput[],
  target: UnfinalizedOutput[],
  changeScript: string,
  feeRate: number
) {
  const required = requiredInputs.map((i) => ({ ...i, required: true }));
  const inputs = ([...required, ...utxos] as SelectableInput[]).map((u) => ({
    address,
    txid: u.txid,
    vout: u.vout,
    value: u.value,
    // height:  // FIXME
    required: u.required || false,
    script: u.scriptSigSize ? "00".repeat(u.scriptSigSize) : "", // Create dummy script sig. If empty, coinselect will default to p2pkh
    utxo: u,
  }));

  const selected: {
    inputs: SelectableInput[];
    outputs: { script: string; value: number }[];
    fee: number;
  } = bsvCoinSelect(inputs, target, feeRate, changeScript);

  if (!selected.inputs) {
    return {
      funded: false,
      funding: [],
      remaining: utxos,
      change: [],
      fee: 0,
    };
  }

  // Find funding inputs
  const remaining = [...utxos];
  const funding = selected.inputs
    .filter((input) => !input.required)
    .map((input) => {
      const found = utxos.find(
        (u) => u.txid === input.txid && u.vout === input.vout
      );

      if (!found) {
        throw Error("Coin selection failed");
      }

      // Remove from remaining UTXOs
      remaining.splice(remaining.indexOf(found), 1);

      return found;
    });

  // Find change outputs
  const change = selected.outputs.slice(target.length);

  return { funded: true, funding, remaining, change, fee: selected.fee };
}

export function updateUnspent(
  { remaining, change }: { remaining: Utxo[]; change: UnfinalizedOutput[] },
  changeTxid: string,
  changeVoutStart: number
) {
  return [...remaining, ...targetToUtxo(change, changeTxid, changeVoutStart)];
}

export function accumulateInputs(utxos: SelectableInput[], amount: number) {
  let sum = 0;
  let index = 0;
  const inputs: SelectableInput[] = [];

  while (sum < amount && index < utxos.length) {
    const utxo = utxos[index];
    sum += utxo.value;
    inputs.push({ ...utxo, required: true });
    index++;
  }

  return { inputs, sum };
}

export default coinSelect;
