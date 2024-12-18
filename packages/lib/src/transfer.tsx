import rjs from "@radiantblockchain/radiantjs";
import coinSelect, { accumulateInputs, SelectableInput } from "./coinSelect";
import { ftScript, nftScript, p2pkhScript } from "./script";
import { buildTx } from "./tx";
import { UnfinalizedInput, UnfinalizedOutput } from "./types";

const { PrivateKey, crypto } = rjs;

export class TransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransferError";
    Object.setPrototypeOf(this, TransferError.prototype);
  }
}

export function transferFungible(
  coins: SelectableInput[],
  tokens: SelectableInput[],
  refLE: string,
  fromAddress: string,
  toAddress: string,
  value: number,
  feeRate: number,
  wif: string
) {
  const fromScript = ftScript(fromAddress, refLE);
  const toScript = ftScript(toAddress, refLE);
  const rxdChangeScript = p2pkhScript(fromAddress);

  if (!toScript || !fromScript || !rxdChangeScript) {
    throw new TransferError("Invalid address");
  }

  const accum = accumulateInputs(tokens, value);

  if (accum.sum < value) {
    throw new TransferError("Insufficient token balance");
  }

  const outputs = [{ script: toScript, value }];
  if (accum.sum > value) {
    // Create FT change output
    outputs.push({ script: fromScript, value: accum.sum - value });
  }

  const selected = coinSelect(
    fromAddress,
    // FIXME check script is using scriptSig not scriptPubKey
    [...accum.inputs, ...coins],
    outputs,
    rxdChangeScript,
    feeRate
  );

  if (!selected.inputs?.length) {
    throw new TransferError("Insufficient funds");
  }

  const privKey = PrivateKey.fromString(wif);

  return {
    tx: buildTx(
      fromAddress,
      privKey.toString(),
      selected.inputs,
      selected.outputs,
      false
    ),
    selected,
  };
}

export function transferFungibleToMany(
  coins: SelectableInput[],
  tokens: SelectableInput[],
  refLE: string,
  fromAddress: string,
  toAddress: string[],
  value: number[],
  feeRate: number,
  wif: string
) {
  if (value.length !== toAddress.length) {
    throw new TransferError("Invalid values");
  }

  const fromScript = ftScript(fromAddress, refLE);
  const toScript = toAddress.map((addr) => ftScript(addr, refLE));
  const rxdChangeScript = p2pkhScript(fromAddress);

  if (toScript.some((addr) => !addr) || !fromScript || !rxdChangeScript) {
    throw new TransferError("Invalid address");
  }

  const total = value.reduce((a, b) => a + b, 0);
  const accum = accumulateInputs(tokens, total);

  if (accum.sum < total) {
    throw new TransferError("Insufficient token balance");
  }

  const outputs = toScript.map((script, index) => ({
    script,
    value: value[index],
  }));
  if (accum.sum > total) {
    // Create FT change output
    outputs.push({ script: fromScript, value: accum.sum - total });
  }

  const selected = coinSelect(
    fromAddress,
    [...accum.inputs, ...coins],
    outputs,
    rxdChangeScript,
    feeRate
  );

  if (!selected.inputs?.length) {
    throw new TransferError("Insufficient funds");
  }

  const privKey = PrivateKey.fromString(wif);

  return {
    tx: buildTx(
      fromAddress,
      privKey.toString(),
      selected.inputs,
      selected.outputs,
      false
    ),
    selected,
  };
}

export function transferNonFungible(
  coins: SelectableInput[],
  nft: SelectableInput,
  refLE: string,
  fromAddress: string,
  toAddress: string,
  feeRate: number,
  wif: string
) {
  const required: SelectableInput = { ...nft, required: true, script: "" };
  const inputs: SelectableInput[] = [required, ...coins.slice()];

  const changeScript = p2pkhScript(fromAddress);
  const script = nftScript(toAddress, refLE);

  if (!script || !changeScript) {
    throw new TransferError("Invalid address");
  }

  const selected = coinSelect(
    fromAddress,
    inputs,
    [{ script, value: nft.value }],
    changeScript,
    feeRate
  );
  if (!selected.inputs?.length) {
    throw new TransferError("Insufficient funds");
  }

  selected.inputs[0].script = nft.script;

  return {
    tx: buildTx(fromAddress, wif, selected.inputs, selected.outputs, false),
    selected,
  };
}

export function transferRadiant(
  coins: SelectableInput[],
  fromAddress: string,
  toScript: string,
  value: number,
  feeRate: number,
  wif: string
) {
  const changeScript = p2pkhScript(fromAddress);

  if (!toScript || !changeScript) {
    throw new TransferError("Invalid address");
  }

  const selected = coinSelect(
    fromAddress,
    coins,
    [{ script: toScript, value }],
    changeScript,
    feeRate
  );

  if (!selected.inputs?.length) {
    throw new TransferError("Insufficient funds");
  }

  return {
    tx: buildTx(fromAddress, wif, selected.inputs, selected.outputs, false),
    selected,
  };
}

export function partiallySigned(
  address: string, // Not needed. Need to refactor buildTx.
  input: UnfinalizedInput,
  output: UnfinalizedOutput,
  wif: string
) {
  const flags =
    crypto.Signature.SIGHASH_SINGLE |
    crypto.Signature.SIGHASH_ANYONECANPAY |
    crypto.Signature.SIGHASH_FORKID;
  return buildTx(
    address,
    wif,
    [input],
    [output],
    false,
    undefined,
    flags,
    true
  );
}
