import { encodeGlyph, isImmutableToken } from "./token";
import {
  commitScriptSize,
  datCommitScript,
  delegateBaseScript,
  delegateBurnScript,
  delegateBurnScriptSize,
  delegateTokenScript,
  dMintDiffToTarget,
  dMintScript,
  ftCommitScript,
  ftScript,
  ftScriptSize,
  mutableNftScript,
  mutableNftScriptSize,
  nftCommitScript,
  nftScript,
  nftScriptSize,
  p2pkhScript,
  p2pkhScriptSigSize,
  p2pkhScriptSize,
  parseNftScript,
  revealScriptSigSize,
  txSize,
} from "./script";
import {
  DeployMethod,
  RevealDirectParams,
  RevealDmintParams,
  RevealPsbtParams,
  SmartTokenPayload,
  TokenContractType,
  TokenMint,
  TokenRevealParams,
  UnfinalizedInput,
  UnfinalizedOutput,
  Utxo,
} from "./types";
import { fundTx, targetToUtxo, updateUnspent } from "./coinSelect";
import { buildTx } from "./tx";
import Outpoint from "./Outpoint";
import rjs from "@radiantblockchain/radiantjs";
import { GLYPH_NFT } from "./protocols";
const { Script, crypto } = rjs;

const defaultFeeRate = 5000;

export function commitBundle(
  deployMethod: DeployMethod,
  address: string,
  wif: string,
  utxos: Utxo[],
  tokens: {
    contract: TokenContractType;
    outputValue: number;
    payload: SmartTokenPayload;
  }[],
  delegate:
    | {
        ref: string;
        utxos: Utxo[];
      }
    | undefined,
  batchSize: number,
  onProgress?: (k: string) => void
) {
  const p2pkh = p2pkhScript(address);
  const batches = new Array(Math.ceil(tokens.length / batchSize))
    .fill(null)
    .map((_, i) => tokens.slice(i * batchSize, (i + 1) * batchSize));

  // Create funding outputs for each batch
  const target = batches.map((batch) => ({
    script: p2pkh,
    value:
      txSize(
        [p2pkhScriptSigSize].concat(delegate ? [p2pkhScriptSigSize] : []),
        batch.flatMap((token) => {
          const hasDelegate = !!(
            token.payload.by?.length || token.payload.in?.length
          );
          const extraRefsRequired = [];
          if (isImmutableToken(token.payload)) {
            // Ref for mutable contract
            extraRefsRequired.push(p2pkhScriptSize);
          }
          if (deployMethod === "dmint") {
            // TODO dmint batch minting isn't fully implemented yet. Schema currently doesn't allow dmint.
            // Refs for:
            // * dmint contract
            // * NFT recording dmint contract info
            extraRefsRequired.push(p2pkhScriptSize, p2pkhScriptSize);
          }
          return [commitScriptSize(token.contract, hasDelegate)].concat(
            extraRefsRequired
          );
        })
      ) * defaultFeeRate,
  }));

  const {
    funded,
    funding: inputs,
    change,
    remaining,
    fee,
  } = fundTx(address, utxos, [], target, p2pkh, defaultFeeRate);

  if (!funded) {
    throw new Error("Couldn't fund transaction");
  }

  // TODO should delegate token creation be merged with funding UTXOs?

  onProgress && onProgress("sign");
  const outputs = target.concat(change?.length ? change : []);
  const funding = buildTx(address, wif, inputs, outputs, false);

  const commits = batches.map((batch, vout) =>
    commitBatch(
      deployMethod,
      address,
      wif,
      batch,
      { txid: funding.id, vout, ...outputs[vout] },
      delegate && { ref: delegate.ref, utxo: delegate.utxos[vout] }
    )
  );

  // Create change UTXOs
  const changeUtxos = targetToUtxo(change, funding.id, target.length);

  return {
    funding: funding.toString(),
    commits,
    remaining,
    change: changeUtxos,
    fees: [fee, ...target.map((t) => t.value)],
  };
}

// Create an NFT that links to another token in the same transaction
// Currently only used to keep a record of dmints.
function createLinkCommit(
  targetRefVout: number,
  address: string,
  targetPayload: SmartTokenPayload,
  delegate?: {
    ref: string;
    utxo: Utxo;
  }
) {
  const linkPayload: SmartTokenPayload = {
    p: [GLYPH_NFT],
    loc: targetRefVout,
  };
  // Set link to the same author if there is one
  if (targetPayload.by) {
    linkPayload.by = targetPayload.by;
  }
  const { payloadHash, revealScriptSig } = encodeGlyph(linkPayload);
  return {
    payloadHash,
    revealScriptSig,
    output: {
      script: nftCommitScript(address, payloadHash, delegate?.ref),
      value: 1,
    },
  };
}

// Deploy method must be known in advance so sequential dmint refs for minting and token contracts can be prepared
export function createCommitOutputs(
  contract: TokenContractType,
  deployMethod: DeployMethod,
  params: RevealDirectParams | RevealDmintParams,
  payload: SmartTokenPayload,
  delegate?: {
    ref: string;
    utxo: Utxo;
  }
) {
  const { address } = params;
  const p2pkh = p2pkhScript(address);
  const immutable = isImmutableToken(payload);
  const { payloadHash, revealScriptSig } = encodeGlyph(payload);
  const scriptFn = {
    nft: nftCommitScript,
    ft: ftCommitScript,
    dat: datCommitScript,
  }[contract];
  const script = scriptFn(address, payloadHash, delegate?.ref);
  const outputs: UnfinalizedOutput[] = [];

  outputs.push({ script, value: 1 });
  if (contract === "nft" && !immutable) {
    // Prepare a ref for the mutable contract. This will be token ref + 1.
    outputs.push({ script: p2pkh, value: 1 });
  }

  if (contract === "ft" && deployMethod === "dmint") {
    // Outputs are required for each contract ref and token ref
    const { numContracts } = params as RevealDmintParams;
    for (let i = 0; i < numContracts; i++) {
      outputs.push({ script: p2pkh, value: 1 });
    }
  }

  return {
    payloadHash,
    immutable,
    revealScriptSig,
    outputs,
  };
}

export function commitBatch(
  deployMethod: DeployMethod,
  address: string,
  wif: string,
  ops: {
    contract: TokenContractType;
    outputValue: number;
    payload: SmartTokenPayload;
  }[],
  funding: Utxo,
  delegate?: {
    ref: string;
    utxo: Utxo;
  }
) {
  const outputs: UnfinalizedOutput[] = [];
  let vout = 0;
  const reveals = ops.map(({ contract, outputValue, payload }) => {
    const { outputs: commitOutputs, ...rest } = createCommitOutputs(
      contract,
      deployMethod,
      { address },
      payload,
      delegate
    );
    outputs.push(...commitOutputs);

    const obj = {
      contract,
      ...rest,
      utxo: {
        vout,
        ...outputs[0],
      },
      outputValue,
    };

    vout += obj.immutable ? 1 : 2;

    return obj;
  });

  const tx = buildTx(
    address,
    wif,
    [funding].concat(delegate ? delegate.utxo : []),
    outputs,
    false
  );

  // Add txid to utxo objects
  const withTxid: TokenMint[] = reveals.map(({ utxo, ...r }) => ({
    utxo: { txid: tx.id, ...utxo },
    ...r,
  }));

  return { txid: tx.id, tx: tx.toString(), data: withTxid };
}

export function revealDirect(
  address: string,
  wif: string,
  utxos: Utxo[],
  mints: TokenMint[],
  revealParams: { [key: string]: TokenRevealParams },
  batchSize: number,
  delegateRef: string | undefined
) {
  const p2pkh = p2pkhScript(address);
  const batches = new Array(Math.ceil(mints.length / batchSize))
    .fill(null)
    .map((_, i) => mints.slice(i * batchSize, (i + 1) * batchSize));

  // Create funding outputs for each batch
  const target = batches.map((batch) => ({
    script: p2pkh,
    value:
      txSize(
        batch
          .flatMap((t) =>
            [revealScriptSigSize(t.revealScriptSig.length / 2)].concat(
              t.immutable ? [] : [p2pkhScriptSigSize]
            )
          )
          .concat(p2pkhScriptSigSize),
        // Output script sizes for fee calculation
        batch
          .flatMap((t) =>
            ([] as number[])
              .concat(t.contract === "nft" ? [nftScriptSize] : [])
              .concat(t.contract === "ft" ? [ftScriptSize] : [])
              .concat(
                t.contract === "nft" && !t.immutable
                  ? [mutableNftScriptSize]
                  : []
              )
          )
          .concat(delegateRef ? delegateBurnScriptSize : [])
      ) *
        defaultFeeRate +
      // Output values
      batch.reduce(
        (a, t) =>
          a +
          (["nft", "ft"].includes(t.contract) ? t.outputValue : 0) +
          (t.contract === "nft" && !t.immutable ? 1 : 0), // 1 photon mutable output
        0
      ),
  }));

  const {
    funding: inputs,
    change,
    remaining,
    fee,
  } = fundTx(address, utxos, [], target, p2pkh, defaultFeeRate);

  const outputs = target.concat(change?.length ? change : []);
  const funding = buildTx(address, wif, inputs, outputs, false);
  const reveals = batches.map((batch, vout) =>
    revealBatch(
      address,
      wif,
      batch,
      "direct",
      revealParams,
      { txid: funding.id, vout, ...outputs[vout] },
      delegateRef
    )
  );

  // Create change UTXOs
  const changeUtxos = targetToUtxo(change, funding.id, target.length);

  return {
    funding: funding.toString(),
    reveals,
    remaining,
    change: changeUtxos,
    fees: [fee, ...target.map((t) => t.value)],
  };
}

// Create outputs for a single token reveal
// Not used for PSBT deployments
export function createRevealOutputs(
  creatorAddress: string,
  mint: TokenMint,
  deployMethod: DeployMethod,
  deployParams: RevealDirectParams | RevealDmintParams
) {
  if (deployMethod === "dmint" && mint.contract !== "ft") {
    throw new Error("Operation does not support dmint deployments");
  }

  const p2pkh = p2pkhScript(creatorAddress);
  const tokenRef = Outpoint.fromObject(mint.utxo).reverse().toString();
  const inputs: UnfinalizedInput[] = [];
  const outputs: UnfinalizedOutput[] = [];

  if (mint.contract === "nft") {
    outputs.push({
      script: nftScript(deployParams.address, tokenRef),
      value: mint.outputValue,
    });
    console.debug("Added NFT output", {
      address: deployParams.address,
      tokenRef,
    });
  } else if (mint.contract === "ft") {
    if (deployMethod === "direct") {
      outputs.push({
        script: ftScript(deployParams.address, tokenRef),
        value: mint.outputValue,
      });
      console.debug("Added FT output", {
        address: deployParams.address,
        tokenRef,
      });
    } else if (deployMethod === "dmint") {
      const dmintParams = deployParams as RevealDmintParams;
      // dmint contract ref is token ref + 1

      for (let i = 0; i < dmintParams.numContracts; i++) {
        const contractRef = Outpoint.fromUTXO(
          mint.utxo.txid,
          mint.utxo.vout + 1 + i
        )
          .reverse()
          .ref();

        outputs.push({
          script: dMintScript(
            0,
            contractRef,
            tokenRef,
            dmintParams.maxHeight,
            dmintParams.reward,
            dMintDiffToTarget(dmintParams.difficulty)
          ),
          value: mint.outputValue,
        });
      }
      console.debug("Added dmint output", {
        tokenRef,
      });

      if (dmintParams.premine > 0) {
        outputs.push({
          script: ftScript(deployParams.address, tokenRef),
          value: dmintParams.premine,
        });
        console.debug(`Added premine of ${dmintParams.premine} tokens`, {
          address: deployParams.address,
          tokenRef,
        });
      }
    }
  }

  inputs.push({
    ...mint.utxo,
    // Add script sig size in case it's needed for fee calculation
    // Batch reveals will already handle this with txSize but single mints require it
    scriptSigSize: revealScriptSigSize(mint.revealScriptSig.length / 2),
  });

  if (mint.contract === "ft" && deployMethod === "dmint") {
    // Add input for creating the dmint contract ref
    const dmintParams = deployParams as RevealDmintParams;
    for (let i = 0; i < dmintParams.numContracts; i++) {
      inputs.push({
        txid: mint.utxo.txid,
        vout: mint.utxo.vout + 1 + i,
        value: 1,
        script: p2pkh,
      });
    }
  }

  if (mint.contract === "nft" && !mint.immutable) {
    const mutableRef = Outpoint.fromUTXO(mint.utxo.txid, mint.utxo.vout + 1)
      .reverse()
      .ref();
    inputs.push({
      txid: mint.utxo.txid,
      vout: mint.utxo.vout + 1,
      value: 1,
      script: p2pkh,
    });
    outputs.push({
      script: mutableNftScript(mutableRef, mint.payloadHash),
      value: 1,
    });
    console.debug("Added mutable contract output", {
      mutableRef,
      tokenRef,
    });
  }

  return { inputs, outputs };
}

export function revealBatch(
  address: string,
  wif: string,
  mints: TokenMint[],
  deployMethod: DeployMethod,
  revealParams: { [key: string]: TokenRevealParams },
  funding: Utxo,
  delegateRef: string | undefined
) {
  const outputs: UnfinalizedOutput[] = [];
  const inputs: Utxo[] = [];
  const tokenScriptSigs: { [key: number]: string } = {}; // Keep track of token outputs so script sig can be modified later
  if (delegateRef) {
    outputs.push({
      script: delegateBurnScript(delegateRef),
      value: 0,
    });
  }
  const refs: string[] = [];
  mints.forEach((mint) => {
    tokenScriptSigs[inputs.length] = mint.revealScriptSig;
    const outpoint = Outpoint.fromObject(mint.utxo);
    const params = revealParams[outpoint.toString()] as RevealDirectParams;
    const revealTxos = createRevealOutputs(address, mint, deployMethod, params);
    inputs.push(...revealTxos.inputs);
    outputs.push(...revealTxos.outputs);
    refs.push(outpoint.toString());
  });

  const tx = buildTx(
    address,
    wif,
    [...inputs, funding],
    outputs,
    false,
    (index, script) => {
      if (tokenScriptSigs[index]) {
        script.add(Script.fromString(tokenScriptSigs[index]));
      }
    }
  );

  return { txid: tx.id, tx: tx.toString(), refs };
}

// Create asset base transaction for a delegate ref
export function createDelegateBase(
  address: string,
  wif: string,
  utxos: Utxo[],
  tokens: Utxo[]
) {
  const refs: string[] = tokens
    .map(({ script }) => parseNftScript(script).ref as string)
    .filter(Boolean);
  if (refs.length !== tokens.length) {
    throw Error("Token cannot be used for ref delegate");
  }
  const script = delegateBaseScript(address, refs);
  const p2pkh = p2pkhScript(address);
  const base = { script, value: 1 };
  const inputs = [...tokens];
  const outputs = [base, ...tokens];

  const { change, funding, fee, remaining } = fundTx(
    address,
    utxos,
    inputs,
    outputs,
    p2pkh,
    defaultFeeRate
  );
  inputs.push(...funding);
  outputs.push(...change);
  const tx = buildTx(address, wif, inputs, outputs, false);

  // Create change UTXOs
  const changeUtxos = targetToUtxo(change, tx.id, 1 + tokens.length);
  const baseUtxo = targetToUtxo([base], tx.id)[0];

  return { tx, utxo: baseUtxo, change: changeUtxos, fee, remaining };
}

// Create transaction for minting a number of delegate token outputs
export function createDelegateTokens(
  address: string,
  wif: string,
  utxos: Utxo[],
  base: Utxo,
  numTokens: number
) {
  const p2pkh = p2pkhScript(address);
  const ref = Outpoint.fromObject(base).reverse().ref();
  const script = delegateTokenScript(address, ref);
  const inputs = [base];
  const outputs = new Array(numTokens).fill({
    script,
    value: 1,
  });

  const { change, fee, funding, remaining } = fundTx(
    address,
    utxos,
    inputs,
    outputs,
    p2pkh,
    defaultFeeRate
  );
  inputs.push(...funding);
  outputs.push(...change);
  const tx = buildTx(address, wif, inputs, outputs, false);
  const newUtxos = targetToUtxo(outputs, tx.id);
  const delegateTokens = newUtxos.slice(0, numTokens);
  const changeUtxos = newUtxos.slice(numTokens);

  return {
    tx: tx.toString(),
    delegateTokens,
    remaining,
    fee,
    change: changeUtxos,
  };
}

export function revealPsbt(
  wif: string,
  mints: TokenMint[],
  revealParams: { [key: string]: RevealPsbtParams }
) {
  const txs: { reveal: string; mutable?: string }[] = [];
  const outpointTokenMap = Object.fromEntries(
    mints.map((t) => [Outpoint.fromObject(t.utxo), t])
  );

  // Iterate revealParams object so transactions can be selectively created
  Object.entries(revealParams).forEach(([k, { photons, address }]) => {
    const { glyph, utxo, immutable } = outpointTokenMap[k];
    const txObj: { reveal: string; mutable?: string } = {
      reveal: buildTx(
        address,
        wif,
        [utxo],
        [{ script: p2pkhScript(address), value: photons }],
        false,
        (_, script) => {
          script.add(Script.fromString(glyph.script));
        },
        crypto.Signature.SIGHASH_SINGLE | crypto.Signature.SIGHASH_ANYONECANPAY
      ).toString(),
    };

    // Mutable contract transactions are created as SIGHASH_ALL | ANYONECANPAY
    // These transactions only require a funding input to be added by the buyer and is broadcast separate to the token reveal transaction
    if (!immutable) {
      const mutableRef = Outpoint.fromObject(utxo).reverse().ref();
      txObj.mutable = buildTx(
        address,
        wif,
        [
          {
            txid: utxo.txid,
            vout: utxo.vout + 1,
            value: 1,
            script: "",
          },
        ],
        [
          {
            script: mutableNftScript(mutableRef, glyph.payloadHash),
            value: 1,
          },
        ],
        false,
        undefined,
        crypto.Signature.SIGHASH_ALL | crypto.Signature.SIGHASH_ANYONECANPAY
      ).toString();
    }

    txs.push(txObj);
  });
  return txs;
}

// Mint a single token
export function mintToken(
  contract: TokenContractType,
  deploy: // PSBT not supported for single mints
  | { method: "direct"; params: RevealDirectParams; value: number }
    | { method: "dmint"; params: RevealDmintParams; value: number },
  wif: string,
  utxos: Utxo[],
  payload: SmartTokenPayload,
  relUtxos: Utxo[],
  feeRate: number
) {
  if (deploy.method === "dmint" && contract !== "ft") {
    throw new Error("Token contract does not support dmint deployments");
  }

  let unspentRxd = utxos;
  const fees: number[] = [];
  const { outputs, ...partialCommitData } = createCommitOutputs(
    contract,
    deploy.method,
    deploy.params,
    payload
  );

  // An NFT link token can be minted at the same time. Currently only used to keep a record of dmints.
  const createLinkToken = deploy.method === "dmint";

  const linkCommit = createLinkToken
    ? createLinkCommit(0, deploy.params.address, payload) // Link to the first ref
    : undefined;
  // Link NFT is always the last output before any change
  linkCommit && outputs.push(linkCommit.output);

  const p2pkh = p2pkhScript(deploy.params.address);
  const commitFund = fundTx(
    deploy.params.address,
    unspentRxd,
    [],
    outputs,
    p2pkh,
    feeRate
  );

  if (commitFund.fee === 0) {
    console.log("Commit funding error", JSON.stringify([unspentRxd, outputs]));
    throw new Error("Couldn't fund transaction");
  }

  fees.push(commitFund.fee);
  const commitOutputs = [...outputs, ...commitFund.change];
  const commitTx = buildTx(
    deploy.params.address,
    wif,
    commitFund.funding,
    commitOutputs,
    false
  );

  unspentRxd = updateUnspent(commitFund, commitTx.id, outputs.length);

  const mint: TokenMint = {
    contract,
    ...partialCommitData,
    utxo: {
      txid: commitTx.id,
      vout: 0,
      ...outputs[0],
    },
    outputValue: deploy.value,
  };

  const revealTarget = createRevealOutputs(
    deploy.params.address,
    mint,
    deploy.method,
    deploy.params
  );

  if (linkCommit) {
    const linkRevealTarget = createRevealOutputs(
      deploy.params.address,
      {
        contract: "nft",
        immutable: true,
        outputValue: 1,
        payloadHash: linkCommit.payloadHash,
        revealScriptSig: linkCommit.revealScriptSig,
        utxo: {
          ...linkCommit.output,
          txid: commitTx.id,
          vout: outputs.length - 1,
        },
      },
      "direct",
      {
        address: deploy.params.address,
      }
    );
    revealTarget.inputs.push(...linkRevealTarget.inputs);
    revealTarget.outputs.push(...linkRevealTarget.outputs);
  }

  // Since this is just a single token, related tokens will be referenced directly in the transaction instead of a delegate
  const revealInputs = [
    ...revealTarget.inputs, // Commit UTXO. This must be first so setInputScript works.
    ...relUtxos, // Related tokens
  ];
  const revealOutputs = [
    ...revealTarget.outputs, // Minted token
    ...relUtxos, // Related tokens
  ];

  const revealFund = fundTx(
    deploy.params.address,
    unspentRxd,
    revealInputs,
    revealOutputs,
    p2pkh,
    feeRate
  );

  if (revealFund.fee === 0) {
    console.log(
      "Reveal funding error",
      JSON.stringify([unspentRxd, revealInputs, revealOutputs])
    );
    throw new Error("Couldn't fund transaction");
  }

  fees.push(revealFund.fee);

  revealInputs.push(
    ...revealFund.funding // Funding
  );
  revealOutputs.push(
    ...revealFund.change // Change
  );

  const revealTx = buildTx(
    deploy.params.address,
    wif,
    revealInputs,
    revealOutputs,
    false,
    (index, script) => {
      if (index === 0) {
        script.add(Script.fromString(mint.revealScriptSig));
      } else if (linkCommit && index === revealTarget.inputs.length - 1) {
        script.add(Script.fromString(linkCommit.revealScriptSig));
      }
    }
  );

  const size = commitTx.toBuffer().length + revealTx.toBuffer().length;
  const ref = Outpoint.fromObject(mint.utxo);

  return {
    commitTx,
    revealTx,
    fees,
    size,
    ref,
  };
}
