import GlowBox from "@app/components/GlowBox";
import TokenContent from "@app/components/TokenContent";
import db from "@app/db";
import { electrumWorker } from "@app/electrum/Electrum";
import { ContractType, SmartToken, SwapError } from "@app/types";
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Container,
  Flex,
  Heading,
  HStack,
  Icon,
  Image,
  Link,
  Spinner,
  Text,
  Textarea,
  useClipboard,
  useToast,
} from "@chakra-ui/react";
import Outpoint, { reverseRef } from "@lib/Outpoint";
import {
  ftScript,
  nftScript,
  p2pkhScript,
  parseFtScript,
  parseNftScript,
  parseP2pkhScript,
} from "@lib/script";
import { bytesToHex } from "@noble/hashes/utils";
// @ts-ignore
import {
  Address,
  Networks,
  Script,
  Transaction,
} from "@radiantblockchain/radiantjs";
import { useState } from "react";
import { MdOutlineSwapVert } from "react-icons/md";
import { AiOutlineSignature } from "react-icons/ai";
import { Link as RouterLink, useLocation } from "react-router-dom";
import rxdIcon from "/rxd.png";
import Card from "@app/components/Card";
import Identifier from "@app/components/Identifier";
import Identicon from "@app/components/Identicon";
import { feeRate, openModal, wallet } from "@app/signals";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { TbSend } from "react-icons/tb";
import { photonsToRXD } from "@lib/format";
import { accumulateInputs, fundTx, SelectableInput } from "@lib/coinSelect";
import { UnfinalizedOutput, Utxo } from "@lib/types";
import { TransferError } from "@lib/transfer";
import { SwapPrepareError } from "./Swap";
import { buildTx } from "@lib/tx";
import createExplorerUrl from "@app/network/createExplorerUrl";

type SwapItemParams = {
  contractType: ContractType;
  glyph: SmartToken | null;
  value: number;
};

type SwapParams = {
  tx: Transaction;
  prevTx: Transaction;
  from: SwapItemParams;
  to: SwapItemParams;
  address: string;
};

function parseScript(script: string) {
  return (
    (
      [
        [ContractType.RXD, parseP2pkhScript],
        [ContractType.FT, parseFtScript],
        [ContractType.NFT, parseNftScript],
      ] as [ContractType, (script: string) => { address: string }][]
    ).reduce<[ContractType, { address: string; ref?: string }] | undefined>(
      (acc, [contractType, fn]) => {
        if (acc) return acc;
        const parsed = fn(script);
        return parsed.address ? [contractType, parsed] : undefined;
      },
      undefined
    ) || [undefined, undefined]
  );
}

async function fetchToken(ref: string) {
  // Look up in database
  const result = await db.glyph.where({ ref }).first();
  if (result) {
    return result;
  }
  return electrumWorker.value.fetchGlyph(ref);
}

function TokenIcon({ glyph }: { glyph: SmartToken }) {
  return (
    <Box w={16} h={16}>
      <TokenContent glyph={glyph} thumbnail />
    </Box>
  );
}

async function loadSwap(psrt: Transaction): Promise<SwapParams | null> {
  // Must have 1 input and 1 output
  if (psrt.inputs.length !== 1 || psrt.outputs.length !== 1) {
    return null;
  }

  const txid = psrt ? bytesToHex(psrt.inputs[0].prevTxId) : undefined;
  const vout = psrt?.inputs[0].outputIndex;
  const script = psrt?.outputs[0].script.toHex();
  const [to, toParams] = script ? parseScript(script) : [undefined, undefined];
  if (to === undefined) {
    return null;
  }

  if (!txid || vout === undefined) return null;
  let fromGlyph = null;
  let toGlyph = null;
  const hex = await electrumWorker.value.getTransaction(txid);
  const tx = new Transaction(hex);
  // Check if the output has been spent
  const isUnspent = await electrumWorker.value.isUtxoUnspent(
    tx.id,
    vout,
    tx.outputs[vout].script.toHex()
  );

  if (!isUnspent) {
    throw new SwapError("Swap has already been completed");
  }

  const [from, fromParams] = parseScript(tx.outputs[vout].script.toHex());
  if (from === undefined) {
    return null;
  }
  if (from !== ContractType.RXD) {
    fromGlyph = await fetchToken(reverseRef(fromParams?.ref as string));
    if (!fromGlyph) {
      return null;
    }
  }
  if (to !== ContractType.RXD) {
    toGlyph = await fetchToken(reverseRef(toParams?.ref as string));
    if (!toGlyph) {
      return null;
    }
  }

  // TODO maybe we should have an op return in the funding tx to indicate this tx follows the protocol

  // Get the funding address so the payment doesn't go to the swap address
  const fromValue = tx.outputs[vout].satoshis;
  const toValue = psrt.outputs[0].satoshis;

  // There has to be a better way to do this...
  const toScript = Script.fromHex(`76a914${toParams.address}88ac`);
  const network =
    wallet.value.net === "mainnet" ? Networks.mainnet : Networks.testnet;
  // @ts-ignore
  const address = Address.fromScript(toScript, network).toString();

  return {
    tx: psrt,
    prevTx: tx,
    from: { contractType: from, glyph: fromGlyph, value: fromValue },
    to: {
      contractType: to,
      glyph: toGlyph,
      value: toValue,
    },
    address,
  };
}

type TokenFunding = {
  inputs: SelectableInput[];
  outputs: UnfinalizedOutput[];
};

async function fundFungible(
  refLE: string,
  value: number
): Promise<TokenFunding> {
  const fromScript = ftScript(wallet.value.address, refLE);
  const tokens = await db.txo.where({ script: fromScript, spent: 0 }).toArray();

  const accum = accumulateInputs(tokens, value);

  if (accum.sum < value) {
    throw new TransferError("Insufficient token balance");
  }

  const outputs = [];
  if (accum.sum > value) {
    // Create FT change output
    outputs.push({ script: fromScript, value: accum.sum - value });
  }

  return { inputs: accum.inputs, outputs };
}

async function fundNonFungible(refLE: string): Promise<TokenFunding> {
  const fromScript = nftScript(wallet.value.address, refLE);
  const nft = await db.txo.where({ script: fromScript, spent: 0 }).first();
  if (!nft) {
    throw new SwapPrepareError("Token not found");
  }
  return { inputs: [nft], outputs: [] };
}

function SwapItem({
  item: { contractType, glyph, value },
}: {
  item: SwapItemParams;
}) {
  const ref = glyph?.ref && Outpoint.fromString(glyph?.ref);

  return (
    <Flex w="full" gap={4} alignItems="center">
      {ref ? (
        <>
          <TokenIcon glyph={glyph} />
          <Box flexGrow={1}>
            <Box>{glyph.name}</Box>
            {contractType === ContractType.FT ? (
              <>
                {value}
                <Text color="lightBlue.A400" as="span" ml={2}>
                  {glyph.ticker}
                </Text>
              </>
            ) : (
              <>{value} Radiant photons</>
            )}
          </Box>
          <div>
            <Identicon
              value={ref.refHash()}
              width="24px"
              height="24px"
              sx={{ svg: { height: "26px" } }}
              float="left"
            />
            <Identifier showCopy copyValue={ref.ref()}>
              {ref.shortRef()}
            </Identifier>
          </div>
        </>
      ) : (
        <>
          <Image src={rxdIcon} width={16} height={16} />
          <Box flexGrow={1}>
            <Box>Radiant</Box>
            {photonsToRXD(value)}
            <Text color="lightBlue.A400" as="span" ml={2}>
              RXD
            </Text>
          </Box>
        </>
      )}
    </Flex>
  );
}

function ViewSwap({ swapParams }: { swapParams: SwapParams }) {
  const toast = useToast();
  const [signed, setSigned] = useState("");
  const { onCopy, hasCopied } = useClipboard(signed);
  const [complete, setComplete] = useState(false);
  const [txid, setTxid] = useState("");

  const signTransaction = async () => {
    setSigned("");

    if (wallet.value.locked || !wallet.value.wif) {
      openModal.value = {
        modal: "unlock",
      };
      return;
    }
    const coins: SelectableInput[] = await db.txo
      .where({ contractType: ContractType.RXD, spent: 0 })
      .toArray();

    const fromRefLE = swapParams.from.glyph?.ref
      ? reverseRef(swapParams.from.glyph?.ref)
      : "";
    const outputScript =
      swapParams.from.contractType === ContractType.RXD
        ? p2pkhScript(wallet.value.address)
        : swapParams.from.contractType === ContractType.FT
        ? ftScript(wallet.value.address, fromRefLE)
        : nftScript(wallet.value.address, fromRefLE);

    const vout = swapParams.tx.inputs[0].outputIndex;
    const inputs: Utxo[] = [
      {
        txid: bytesToHex(swapParams.tx.inputs[0].prevTxId),
        vout,
        script: swapParams.tx.outputs[vout].script.toString(),
        value: swapParams.from.value,
      },
    ];

    const outputs: UnfinalizedOutput[] = [
      {
        script: swapParams.tx.outputs[0].script.toString(),
        value: swapParams.tx.outputs[0].satoshis,
      },
      {
        script: outputScript,
        value: swapParams.from.value,
      },
    ];

    try {
      // Fund token swaps. Any RXD required for the swap will be done later when funding the whole transaction.
      if (swapParams.to.contractType !== ContractType.RXD) {
        const toRefLE = reverseRef(swapParams.to.glyph?.ref as string);
        if (swapParams.to.contractType === ContractType.FT) {
          const prepared = await fundFungible(toRefLE, swapParams.to.value);
          inputs.push(...prepared.inputs);
          outputs.push(...prepared.outputs);
        } else {
          const prepared = await fundNonFungible(toRefLE);
          inputs.push(...prepared.inputs);
          outputs.push(...prepared.outputs);
        }
      }

      const changeScript = p2pkhScript(wallet.value.address);
      const fund = fundTx(
        wallet.value.address,
        coins,
        inputs,
        outputs,
        changeScript,
        feeRate.value
      );

      if (!fund.funded) {
        throw new SwapError("Failed to fund");
      }

      inputs.push(...fund.funding);
      outputs.push(...fund.change);

      const tx = buildTx(
        wallet.value.address,
        wallet.value.wif,
        inputs,
        outputs,
        false,
        (index, script) => {
          if (index === 0) {
            return swapParams.tx.inputs[0].script;
          }
          return script;
        }
      );
      setSigned(tx.toString());
    } catch (error) {
      if (error instanceof TransferError || error instanceof SwapError) {
        toast({ status: "error", title: error.message });
      } else {
        toast({ status: "error", title: "Failed to create transaction" });
      }
      console.debug(error);
      return;
    }
  };

  const broadcast = async () => {
    if (!signed) {
      toast({ status: "error", title: "Transaction not signed" });
      return;
    }

    try {
      const txid = await electrumWorker.value.broadcast(signed);
      await db.broadcast.put({
        txid,
        date: Date.now(),
        description: "rxd_swap_cancel",
      });

      setComplete(true);
      setTxid(txid);
    } catch (error) {
      console.debug(error);
      toast({ status: "error", title: "Transaction failed" });
    }
  };

  return (
    <>
      <Card gap={4} p={{ base: 4, md: 8 }} w="full">
        <Heading size="md" pb={4} pl={2}>
          Receive
        </Heading>
        <SwapItem item={swapParams.from} />
      </Card>
      <Icon as={MdOutlineSwapVert} boxSize={6} color="gray.200" />
      <Card gap={4} p={{ base: 4, md: 8 }} w="full">
        <Heading size="md" pb={4} pl={2}>
          Send to
          <Identifier showCopy copyValue={swapParams.address} ml={4}>
            {swapParams.address}
          </Identifier>
        </Heading>
        <SwapItem item={swapParams.to} />
      </Card>
      {complete ? (
        <Alert mt={8} status="success">
          <AlertIcon />
          Swap complete!{" "}
          <Link
            as={RouterLink}
            to={createExplorerUrl(txid)}
            target="_blank"
            isExternal
            ml={2}
          >
            View on block explorer
            <ExternalLinkIcon ml={1} />
          </Link>
        </Alert>
      ) : (
        <>
          {signed && (
            <Alert mt={8}>
              <AlertIcon />
              Transaction is funded and signed. Broadcast to complete swap.
            </Alert>
          )}
          <Flex
            justifyContent="center"
            py={8}
            gap={4}
            flexDir={{ base: "column", md: "row" }}
            w="full"
          >
            {signed ? (
              <>
                <Button
                  leftIcon={
                    hasCopied ? <CheckIcon color="green.400" /> : <CopyIcon />
                  }
                  onClick={onCopy}
                  shadow="dark-md"
                >
                  Copy Signed Transaction
                </Button>
                <Button
                  leftIcon={<TbSend />}
                  variant="primary"
                  shadow="dark-md"
                  onClick={() => broadcast()}
                >
                  Broadcast Transaction
                </Button>
              </>
            ) : (
              <Button
                shadow="dark-md"
                leftIcon={<AiOutlineSignature />}
                onClick={() => signTransaction()}
              >
                Sign Transaction
              </Button>
            )}
          </Flex>
        </>
      )}
    </>
  );
}

export default function SwapLoadPage() {
  const location = useLocation();
  // Use location key to reset page state
  return <SwapLoad key={location.key} />;
}

function SwapLoad() {
  const [loading, setLoading] = useState(false);
  const [glow, setGlow] = useState(false);
  const [error, setError] = useState("");
  const [swapParams, setSwapParams] = useState<SwapParams | null>(null);
  const onChange: React.ChangeEventHandler<HTMLTextAreaElement> = async (
    event
  ) => {
    const text = event.target.value;
    try {
      setError("");
      setLoading(true);
      const decoded = new Transaction(text);
      setSwapParams(await loadSwap(decoded));
    } catch (error) {
      if (error instanceof SwapError) {
        setError("Swap already completed");
      } else {
        console.log(error);
        setError("Invalid transaction");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container
      maxW="container.md"
      px={4}
      gap={8}
      display="flex"
      flexDir="column"
      alignItems="center"
    >
      {swapParams ? (
        <ViewSwap swapParams={swapParams} />
      ) : (
        <>
          <Box>Copy and paste raw transaction hex string</Box>
          <Flex justifyContent="center" alignItems="center" gap={6} w="full">
            <GlowBox
              active={glow}
              onFocus={() => setGlow(true)}
              onBlur={() => setGlow(false)}
              cursor="pointer"
              flexGrow={1}
              borderRadius="md"
              bg="bg.300"
            >
              <Textarea
                placeholder="Paste transaction hex here"
                border={0}
                rows={10}
                onChange={onChange}
              />
            </GlowBox>
          </Flex>
          {error && (
            <Alert status="error">
              <AlertIcon />
              {error}
            </Alert>
          )}
          {loading && (
            <HStack>
              <Spinner size="md" />
              <div>Loading</div>
            </HStack>
          )}
        </>
      )}
    </Container>
  );
}
