import Card from "@app/components/Card";
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Container,
  Flex,
  Grid,
  GridItem,
  Heading,
  Icon,
  IconButton,
  Image,
  Input,
  InputGroup,
  InputRightAddon,
  useToast,
} from "@chakra-ui/react";
import { MdOutlineSwapVert } from "react-icons/md";
import { DeleteIcon } from "@chakra-ui/icons";
import TokenSearch from "@app/components/TokenSearch";
import {
  ContractType,
  SmartToken,
  SmartTokenType,
  SwapError,
  SwapStatus,
} from "@app/types";
import { PropsWithChildren, useState } from "react";
import TokenContent from "@app/components/TokenContent";
import rxdIcon from "/rxd.png";
import { useLocation } from "react-router-dom";
import { ftScript, nftScript, p2pkhScript } from "@lib/script";
import { feeRate, openModal, wallet } from "@app/signals";
import { SelectableInput } from "@lib/coinSelect";
import db from "@app/db";
import {
  partiallySigned,
  TransferError,
  transferFungible,
  transferNonFungible,
  transferRadiant,
} from "@lib/transfer";
import { reverseRef } from "@lib/Outpoint";
import {
  updateFtBalances,
  updateRxdBalances,
  updateWalletUtxos,
} from "@app/utxos";
import { electrumWorker } from "@app/electrum/Electrum";
import ViewSwap from "@app/components/ViewSwap";

export class SwapPrepareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SwapPrepareError";
    Object.setPrototypeOf(this, SwapPrepareError.prototype);
  }
}

// Move fungible tokens to swap address
async function prepareFungible(
  coins: SelectableInput[],
  refLE: string,
  asset: Asset
) {
  const fromScript = ftScript(wallet.value.address, refLE);
  const tokens = await db.txo.where({ script: fromScript, spent: 0 }).toArray();
  const { tx, selected } = transferFungible(
    coins,
    tokens,
    refLE,
    wallet.value.address,
    wallet.value.swapAddress,
    asset.value,
    feeRate.value,
    wallet.value.wif as string
  );
  const rawTx = tx.toString();
  const txid = await electrumWorker.value.broadcast(rawTx);
  db.broadcast.put({
    txid,
    date: Date.now(),
    description: "ft_swap_prepare",
  });
  const changeScript = p2pkhScript(wallet.value.address);
  await updateWalletUtxos(
    ContractType.FT,
    fromScript, // FT change
    changeScript, // RXD change
    txid,
    selected.inputs,
    selected.outputs
  );
  updateFtBalances(new Set([fromScript]));
  return tx;
}

// Move NFT to swap address
async function prepareNonFungible(
  coins: SelectableInput[],
  refLE: string,
  asset: Asset
) {
  const fromScript = nftScript(wallet.value.address, refLE);
  const nft = await db.txo.where({ script: fromScript, spent: 0 }).first();
  if (!nft) {
    throw new SwapPrepareError("Token not found");
  }
  const { tx, selected } = transferNonFungible(
    coins,
    nft,
    refLE,
    wallet.value.address,
    wallet.value.swapAddress,
    feeRate.value,
    wallet.value.wif as string
  );
  const rawTx = tx.toString();
  const txid = await electrumWorker.value.broadcast(rawTx);
  db.broadcast.put({
    txid,
    date: Date.now(),
    description: "nft_swap_prepare",
  });
  const changeScript = p2pkhScript(wallet.value.address);

  await updateWalletUtxos(
    ContractType.NFT,
    fromScript,
    changeScript,
    txid,
    selected.inputs,
    selected.outputs
  );

  if (asset.glyph.id) {
    await db.glyph.update(asset.glyph.id, {
      swapPending: true,
    });
  }

  return tx;
}

// Move RXD to swap address
async function prepareRadiant(coins: SelectableInput[], value: number) {
  const { tx, selected } = transferRadiant(
    coins,
    wallet.value.address,
    p2pkhScript(wallet.value.swapAddress),
    value,
    feeRate.value,
    wallet.value.wif as string
  );

  const rawTx = tx.toString();
  const txid = await electrumWorker.value.broadcast(rawTx);
  db.broadcast.put({
    txid,
    date: Date.now(),
    description: "rxd_swap_prepare",
  });

  // Update UTXOs without waiting for subscription
  const changeScript = p2pkhScript(wallet.value.address);
  await updateWalletUtxos(
    ContractType.RXD,
    changeScript,
    changeScript,
    txid,
    selected.inputs,
    selected.outputs
  );
  return tx;
}

const Row = ({
  name,
  tokenType,
  ticker,
  icon,
  onChangeValue,
  onDelete,
  step,
}: {
  name: string;
  tokenType?: SmartTokenType;
  ticker: string;
  icon: React.ReactElement;
  onChangeValue: React.ChangeEventHandler<HTMLInputElement>;
  onDelete?: React.MouseEventHandler<HTMLDivElement>;
  step?: string;
}) => {
  return (
    <Grid
      templateColumns={{ base: "40px auto auto", md: "40px 1fr 300px 40px" }}
      templateRows={{ base: "24px 72px", md: "72px" }}
      columnGap={2}
      px={4}
      alignItems="center"
      bgGradient="linear(to-b, bg.100, bg.300)"
      borderRadius="md"
    >
      <GridItem>{icon}</GridItem>
      <GridItem
        fontSize={{ base: "sm", md: "md" }}
        colSpan={{ base: 3, md: "auto" }}
        order={{ base: -1, md: "unset" }}
        sx={{ textWrap: "nowrap" }}
        overflow="hidden"
        textOverflow="ellipsis"
      >
        {name}
      </GridItem>
      {tokenType === SmartTokenType.NFT ? (
        <Box />
      ) : (
        <GridItem as={InputGroup}>
          <Input
            placeholder="0"
            type="number"
            onChange={onChangeValue}
            minW={16}
            step={step || "1"}
          />
          {ticker && <InputRightAddon>{ticker}</InputRightAddon>}
        </GridItem>
      )}
      <GridItem
        as={IconButton}
        icon={<DeleteIcon />}
        onClick={onDelete}
        disabled={!onDelete}
      ></GridItem>
    </Grid>
  );
};

type Asset = {
  glyph: SmartToken;
  value: number;
};

function OutputSelection({
  heading,
  asset,
  setAsset,
  setRxd,
}: {
  heading: string;
  asset: Asset | null;
  setAsset: React.Dispatch<React.SetStateAction<Asset | null>>;
  setRxd: React.Dispatch<React.SetStateAction<number>>;
}) {
  const onChangeValue = (value: string) => {
    if (asset) {
      setAsset({ glyph: asset?.glyph, value: parseInt(value, 10) });
    }
  };

  const add = (glyph: SmartToken) => {
    setAsset({ glyph, value: 0 });
  };

  const remove = () => {
    setAsset(null);
  };

  return (
    <Card as={Flex} p={{ base: 4, md: 8 }}>
      <Heading size="md" pb={4} pl={2}>
        {heading}
      </Heading>
      <Flex flexDir="column" gap={2} mb={4}>
        {asset ? (
          <Row
            key={asset.glyph.id}
            name={asset.glyph.name}
            tokenType={asset.glyph.tokenType}
            ticker={asset.glyph.ticker || ""}
            icon={<TokenContent glyph={asset.glyph} thumbnail />}
            onChangeValue={(event) => {
              onChangeValue(event.target.value);
            }}
            onDelete={() => remove()}
          />
        ) : (
          <Row
            key="rxd"
            name="Radiant"
            ticker="RXD"
            icon={<Image src={rxdIcon} width={8} height={8} />}
            onChangeValue={(event) => {
              setRxd(Number(event.target.value));
            }}
            step="0.00000001"
          />
        )}
      </Flex>
      <TokenSearch onSelect={add} />
    </Card>
  );
}

export default function SwapPage() {
  const location = useLocation();
  // Use location key to reset the page when clicking "new"
  return <Swap key={location.key} />;
}

const ViewFooter = ({ children }: PropsWithChildren) => {
  return (
    <Flex
      justifyContent="center"
      py={8}
      gap={4}
      flexDir={{ base: "column", md: "row" }}
    >
      {children}
    </Flex>
  );
};

function Swap() {
  // TODO test swapAddress gets created for old wallets
  const toast = useToast();
  const [send, setSend] = useState<Asset | null>(null);
  const [sendRxd, setSendRxd] = useState(0);
  const [receive, setReceive] = useState<Asset | null>(null);
  const [receiveRxd, setReceiveRxd] = useState(0);
  const [psrt, setPsrt] = useState("");

  const prepareTransaction = async () => {
    if (wallet.value.locked || !wallet.value.swapWif) {
      openModal.value = {
        modal: "unlock",
      };
      return;
    }

    if (!wallet.value.wif) {
      // TODO error handling
      return;
    }

    const coins: SelectableInput[] = await db.txo
      .where({ contractType: ContractType.RXD, spent: 0 })
      .toArray();

    // TODO check input values > 0

    let tx;
    let from;
    let fromValue;
    try {
      if (send) {
        // Token to RXD
        const refLE = reverseRef(send.glyph.ref);

        if (send.glyph.tokenType === SmartTokenType.FT) {
          tx = await prepareFungible(coins, refLE, send);
          from = ContractType.FT;
          fromValue = send.value;
        } else {
          tx = await prepareNonFungible(coins, refLE, send);
          from = ContractType.NFT;
          fromValue = 1;
        }
      } else {
        const sendRxdPhotons = sendRxd * 100000000;
        tx = await prepareRadiant(coins, sendRxdPhotons);
        from = ContractType.RXD;
        fromValue = sendRxdPhotons;
      }
    } catch (error) {
      if (error instanceof TransferError || error instanceof SwapError) {
        toast({ status: "error", title: error.message });
      } else {
        toast({ status: "error", title: "Failed to create transaction" });
      }
      console.debug(error);
      return;
    }

    let psrtOutput;
    let to;
    let toValue;
    if (receive) {
      const refLE = reverseRef(receive.glyph.ref);
      if (receive.glyph.tokenType === SmartTokenType.FT) {
        psrtOutput = {
          script: ftScript(wallet.value.address, refLE),
          value: receive?.value as number,
        };
        to = ContractType.FT;
        toValue = receive.value;
      } else {
        psrtOutput = {
          script: nftScript(wallet.value.address, refLE),
          value: 1,
        };
        to = ContractType.NFT;
        toValue = 1;
      }
    } else {
      const receiveRxdPhotons = receiveRxd * 100000000;
      psrtOutput = {
        script: p2pkhScript(wallet.value.address),
        value: receiveRxdPhotons,
      };
      to = ContractType.RXD;
      toValue = receiveRxdPhotons;
    }

    if (!tx) {
      // TODO error handling
      return;
    }

    updateRxdBalances(wallet.value.address);

    const input = {
      txid: tx.id,
      vout: 0,
      script: tx.outputs[0].script.toHex(),
      value: tx.outputs[0].satoshis,
    };

    // Build Partially Signed Radiant Transaction
    const rawPsrt = partiallySigned(
      wallet.value.swapAddress,
      input,
      psrtOutput,
      wallet.value.swapWif
    ).toString();
    setPsrt(rawPsrt);
    toast({ status: "success", title: "Swap transaction created" });

    console.debug(rawPsrt);

    db.swap.put({
      txid: tx.id,
      tx: rawPsrt,
      from,
      fromGlyph: send?.glyph?.ref || null, // null for RXD
      fromValue,
      to,
      toGlyph: receive?.glyph?.ref || null, // null for RXD
      toValue,
      status: SwapStatus.PENDING,
      date: Date.now(),
    });
  };

  if (psrt) {
    return (
      <Container maxW="container.md" px={4} gap={8}>
        <Heading size="md" pb={4} pl={2}>
          Transaction
        </Heading>
        <ViewSwap
          from={send || sendRxd * 100000000}
          to={receive || receiveRxd * 100000000}
          hex={psrt}
          BodyComponent={Card}
          FooterComponent={ViewFooter}
        />
      </Container>
    );
  }

  return (
    <Container maxW="container.md" px={4} gap={8}>
      <OutputSelection
        heading="Send"
        asset={send}
        setAsset={setSend}
        setRxd={setSendRxd}
      />
      <Flex justifyContent="center" py={8}>
        <Icon as={MdOutlineSwapVert} boxSize={8} color="gray.200" />
      </Flex>
      <OutputSelection
        heading="Receive"
        asset={receive}
        setAsset={setReceive}
        setRxd={setReceiveRxd}
      />
      <Alert mt={8}>
        <AlertIcon />
        Tokens or Radiant coins to send will be reserved so they are not spent
        by the wallet. The transaction must be cancelled to make them spendable
        again.
      </Alert>
      <Flex
        justifyContent="center"
        py={8}
        gap={4}
        flexDir={{ base: "column", md: "row" }}
      >
        <Button shadow="dark-md" onClick={prepareTransaction}>
          Prepare Transaction
        </Button>
      </Flex>
    </Container>
  );
}
