import { useEffect, useRef, useState } from "react";
import { t } from "@lingui/macro";
import { SelectableInput } from "@lib/coinSelect";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  FormControl,
  FormLabel,
  Input,
  ModalCloseButton,
  UseDisclosureProps,
  Alert,
  AlertDescription,
  AlertIcon,
  InputGroup,
  InputRightAddon,
  Box,
  Heading,
  VStack,
  useToast,
  Flex,
  Textarea,
} from "@chakra-ui/react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@app/db";
import { SmartToken, ContractType } from "@app/types";
import { ftScript, isP2pkh, p2pkhScript } from "@lib/script";
import { feeRate, network, wallet } from "@app/signals";
import { reverseRef } from "@lib/Outpoint";
import TokenContent from "./TokenContent";
import { RiQuestionFill } from "react-icons/ri";
import { electrumWorker } from "@app/electrum/Electrum";
import FtBalance from "./FtBalance";
import { updateFtBalances, updateWalletUtxos } from "@app/utxos";
import AddressInput from "./AddressInput";
import { TransferError, transferFungibleToMany } from "@lib/transfer";

interface Props {
  glyph: SmartToken;
  onSuccess?: (txid: string) => void;
  disclosure: UseDisclosureProps;
}

const splitAddresses = (addresses: string) =>
  addresses.split("\n").map((addr) => addr.trim());

export default function AirdropFungible({
  glyph,
  onSuccess,
  disclosure,
}: Props) {
  const { isOpen, onClose } = disclosure;
  const amount = useRef<HTMLInputElement>(null);
  const toAddresses = useRef<HTMLTextAreaElement>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(true);
  const [total, setTotal] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const toast = useToast();

  const rxd = useLiveQuery(
    () => db.txo.where({ contractType: ContractType.RXD, spent: 0 }).toArray(),
    [],
    []
  );

  const setFailure = (reason: string) => {
    setErrorMessage(reason);
    setSuccess(false);
    setLoading(false);
  };

  useEffect(() => {
    setSuccess(true);
    setLoading(false);
  }, [isOpen]);

  const ticker = (glyph.ticker as string) || glyph.name || "???";

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(true);
    setLoading(true);

    if (!amount.current?.value) {
      return setFailure(t`Invalid amount`);
    }

    const addresses = splitAddresses(toAddresses.current?.value || "");

    const invalid = addresses.find((addr) => !isP2pkh(addr));

    if (!addresses.length || invalid) {
      return setFailure(t`Invalid address` + (invalid ? ` "${invalid}"` : ""));
    }

    const value = parseInt(amount.current?.value, 10);
    const refLE = reverseRef(glyph.ref);
    const fromScript = ftScript(wallet.value.address, refLE);
    const tokens = await db.txo
      .where({ script: fromScript, spent: 0 })
      .toArray();

    const coins: SelectableInput[] = rxd.slice();
    const values = addresses.map(() => value);
    try {
      const { tx, selected } = transferFungibleToMany(
        coins,
        tokens,
        refLE,
        wallet.value.address,
        addresses,
        values,
        feeRate.value,
        wallet.value.wif as string
      );
      const rawTx = tx.toString();
      const changeScript = p2pkhScript(wallet.value.address);

      console.debug("Broadcasting", rawTx);
      const txid = await electrumWorker.value.broadcast(rawTx);
      db.broadcast.put({ txid, date: Date.now(), description: "ft_send" });
      console.debug("Result", txid);
      toast({
        title: t`Sent ${value} ${ticker}`,
        status: "success",
      });

      await updateWalletUtxos(
        ContractType.FT,
        fromScript, // FT change
        changeScript, // RXD change
        txid,
        selected.inputs,
        selected.outputs
      );
      updateFtBalances(new Set([fromScript]));

      onSuccess && onSuccess(txid);
    } catch (error) {
      if (error instanceof TransferError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(t`Could not send transaction`);
      }
      console.error(error);
      setSuccess(false);
      setLoading(false);
    }
  };

  const [scan, setScan] = useState(false);
  const onScan = (value: string) => {
    setScan(false);
    setSuccess(true);
    if (toAddresses.current) {
      toAddresses.current.value = value;
    }
  };

  const updateTotal = () => {
    const value = amount.current?.value
      ? parseInt(amount.current?.value, 10)
      : 0;
    const toCount = splitAddresses(toAddresses.current?.value || "").length;
    setTotal(value * toCount);
  };

  if (!isOpen || !onClose) return null;

  return (
    <Modal
      closeOnOverlayClick
      isOpen={isOpen}
      onClose={onClose}
      initialFocusRef={toAddresses}
      isCentered
    >
      <form onSubmit={submit}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t`Airdrop ${glyph.name || ticker}`}</ModalHeader>
          <ModalCloseButton />
          <AddressInput
            open={scan}
            onScan={onScan}
            onClose={() => setScan(false)}
          >
            <ModalBody pb={6} gap={4} hidden={scan}>
              <VStack>
                <Box w="48px" h="48px">
                  <TokenContent
                    glyph={glyph}
                    defaultIcon={RiQuestionFill}
                    thumbnail
                  />
                </Box>
                <Heading size="sm">{t`Balance`}</Heading>
                <Box>
                  <FtBalance id={glyph.ref} />
                </Box>
              </VStack>
              {success || (
                <Alert status="error" mb={4}>
                  <AlertIcon />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}
              <FormControl>
                <FormLabel>To</FormLabel>
                <Flex gap={2}>
                  <Textarea
                    onChange={updateTotal}
                    rows={5}
                    ref={toAddresses}
                    placeholder={`List of ${network.value.name} addresses, each address on a new line`}
                    spellCheck={false}
                  />
                </Flex>
              </FormControl>
              <FormControl>
                <FormLabel>{t`Amount per address`}</FormLabel>
                <InputGroup>
                  <Input
                    onChange={updateTotal}
                    ref={amount}
                    type="number"
                    placeholder="0"
                  />
                  <InputRightAddon children={ticker} userSelect="none" />
                </InputGroup>
              </FormControl>
              <Box>
                Total: {total} {ticker || glyph.name}
              </Box>
            </ModalBody>

            <ModalFooter hidden={scan}>
              <Button
                type="submit"
                variant="primary"
                isLoading={loading}
                mr={4}
              >
                {t`Send`}
              </Button>
              <Button onClick={onClose}>{t`Cancel`}</Button>
            </ModalFooter>
          </AddressInput>
        </ModalContent>
      </form>
    </Modal>
  );
}
