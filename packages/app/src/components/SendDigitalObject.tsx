import { useEffect, useRef, useState } from "react";
import { t } from "@lingui/macro";
import { PrivateKey } from "@radiantblockchain/radiantjs";
import coinSelect, { SelectableInput } from "@lib/coinSelect";
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
} from "@chakra-ui/react";
import { photonsToRXD } from "@lib/format";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@app/db";
import { ContractType, SmartToken, TxO } from "@app/types";
import { p2pkhScript, nftScript } from "@lib/script";
import { buildTx } from "@lib/tx";
import Identifier from "./Identifier";
import Outpoint from "@lib/Outpoint";
import { feeRate, network, wallet } from "@app/signals";
import { electrumWorker } from "@app/electrum/Electrum";
import { updateRxdBalances, updateWalletUtxos } from "@app/utxos";

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
    if (!toAddress.current?.value) {
      // TODO validate address
      fail = true;
      setErrorMessage(t`Invalid address`);
    }

    if (fail) {
      setSuccess(false);
      setLoading(false);
      return;
    }

    // Set script to "" so P2PKH scriptSig is used for fee calculation
    const required: SelectableInput = { ...txo, required: true, script: "" };
    const inputs: SelectableInput[] = [required, ...rxd.slice()];

    const changeScript = p2pkhScript(wallet.value.address);
    const script = nftScript(
      toAddress.current?.value as string,
      ref.toString()
    );
    const sendToSelf = toAddress.current?.value === wallet.value.address;

    const selected = coinSelect(
      wallet.value.address,
      inputs,
      [{ script, value: txo.value }],
      changeScript,
      feeRate.value
    );
    if (!selected.inputs?.length) {
      setErrorMessage(t`Insufficient funds`);
      setSuccess(false);
      setLoading(false);
      return;
    }

    selected.inputs[0].script = txo.script;

    const privKey = PrivateKey.fromString(wallet.value.wif as string);

    const rawTx = buildTx(
      wallet.value.address,
      privKey.toString(),
      selected.inputs,
      selected.outputs,
      false
    ).toString();
    try {
      const txid = await electrumWorker.value.broadcast(rawTx);
      db.broadcast.put({ txid, date: Date.now(), description: "nft_send" });

      toast({
        title: t`Sent NFT`,
        status: "success",
      });

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
      setErrorMessage(t`Transaction rejected`);
      console.debug(error);
      setSuccess(false);
      setLoading(false);
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
          <ModalBody pb={6} gap={4}>
            {success || (
              <Alert status="error" mb={4}>
                <AlertIcon />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            <FormControl>
              <FormLabel>To</FormLabel>
              <Input
                ref={toAddress}
                type="text"
                placeholder={t`${network.value.name} address`}
              />
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
          <ModalFooter>
            <Button type="submit" variant="primary" isLoading={loading} mr={4}>
              {t`Send`}
            </Button>
            <Button onClick={onClose}>{t`Cancel`}</Button>
          </ModalFooter>
        </ModalContent>
      </form>
    </Modal>
  );
}
