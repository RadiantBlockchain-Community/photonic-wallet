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
  useToast,
  Flex,
  IconButton,
} from "@chakra-ui/react";
import { photonsToRXD } from "@lib/format";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@app/db";
import { ContractType, SmartToken, TxO } from "@app/types";
import { isP2pkh, p2pkhScript } from "@lib/script";
import Identifier from "./Identifier";
import Outpoint from "@lib/Outpoint";
import { feeRate, network, wallet } from "@app/signals";
import { electrumWorker } from "@app/electrum/Electrum";
import { updateRxdBalances, updateWalletUtxos } from "@app/utxos";
import { BsQrCodeScan } from "react-icons/bs";
import AddressInput from "./AddressInput";
import { TransferError, transferNonFungible } from "@lib/transfer";

interface Props {
  glyph: SmartToken;
  txo: TxO;
  onSuccess?: (txid: string) => void;
  disclosure: UseDisclosureProps;
}

export default function SendDigitalObject({
  glyph,
  txo,
  onSuccess,
  disclosure,
}: Props) {
  const { isOpen, onClose } = disclosure;
  const toAddress = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const toast = useToast();
  const ref = Outpoint.fromString(txo.script.substring(2, 74));

  const rxd = useLiveQuery(
    () => db.txo.where({ contractType: ContractType.RXD, spent: 0 }).toArray(),
    [],
    []
  );

  useEffect(() => {
    setSuccess(true);
    setLoading(false);
  }, [isOpen]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(true);
    setLoading(true);

    let fail = false;
    if (!toAddress.current?.value || !isP2pkh(toAddress.current.value)) {
      fail = true;
      setErrorMessage(t`Invalid address`);
    }

    if (fail) {
      setSuccess(false);
      setLoading(false);
      return;
    }
    const coins: SelectableInput[] = rxd.slice();

    try {
      const { tx, selected } = transferNonFungible(
        coins,
        txo,
        ref.toString(),
        wallet.value.address,
        toAddress.current?.value as string,
        feeRate.value,
        wallet.value.wif as string
      );

      const rawTx = tx.toString();
      const txid = await electrumWorker.value.broadcast(rawTx);
      db.broadcast.put({ txid, date: Date.now(), description: "nft_send" });

      toast({
        title: t`Sent NFT`,
        status: "success",
      });
      const changeScript = p2pkhScript(wallet.value.address);
      const sendToSelf = toAddress.current?.value === wallet.value.address;

      const newTxos = await updateWalletUtxos(
        ContractType.NFT,
        txo.script, // NFT script, if sent to self
        changeScript, // RXD change
        txid,
        selected.inputs,
        selected.outputs
      );

      if (glyph.id) {
        if (sendToSelf) {
          // If sent to self, update lastTxoId of glyph
          await db.glyph.update(glyph.id, {
            lastTxoId: newTxos[0].id,
            height: Infinity,
          });
        } else {
          // Remove from UI
          await db.glyph.update(glyph.id, { spent: 1 });
        }
      }
      // Update RXD change
      updateRxdBalances(wallet.value.address);

      onSuccess && onSuccess(txid);
    } catch (error) {
      if (error instanceof TransferError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(t`Transaction rejected`);
      }
      console.debug(error);
      setSuccess(false);
      setLoading(false);
    }
  };

  const [scan, setScan] = useState(false);
  const onScan = (value: string) => {
    setScan(false);
    setSuccess(true);
    if (toAddress.current) {
      toAddress.current.value = value;
    }
  };

  if (!isOpen || !onClose) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      initialFocusRef={toAddress}
      isCentered
    >
      <form onSubmit={submit}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t`Send Non-Fungible Token`}</ModalHeader>
          <ModalCloseButton />
          <AddressInput
            open={scan}
            onScan={onScan}
            onClose={() => setScan(false)}
          >
            <ModalBody pb={6} gap={4} hidden={scan}>
              {success || (
                <Alert status="error" mb={4}>
                  <AlertIcon />
                  <AlertDescription>{errorMessage}</AlertDescription>
                </Alert>
              )}
              <FormControl>
                <FormLabel>To</FormLabel>
                <Flex gap={2}>
                  <Input
                    ref={toAddress}
                    type="text"
                    placeholder={`${network.value.name} address`}
                  />
                  <IconButton
                    icon={<BsQrCodeScan />}
                    aria-label="Scan QR code"
                    onClick={() => setScan(true)}
                  />
                </Flex>
              </FormControl>
              <FormControl>
                <FormLabel>{t`Non-Fungible Token`}</FormLabel>
                <Identifier>{ref.reverse().shortInput()}</Identifier>
              </FormControl>
              <FormControl>
                <FormLabel>{t`Amount`}</FormLabel>
                <Identifier>{`${photonsToRXD(txo.value)} ${
                  network.value.ticker
                }`}</Identifier>
              </FormControl>
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
