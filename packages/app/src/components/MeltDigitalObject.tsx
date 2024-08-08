import { useEffect, useState } from "react";
import { t } from "@lingui/macro";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  ModalCloseButton,
  UseDisclosureProps,
  useToast,
  Flex,
  Alert,
  AlertDescription,
  AlertIcon,
} from "@chakra-ui/react";
import { ContractType, TxO } from "@app/types";
import { WarningIcon } from "@chakra-ui/icons";
import coinSelect, { SelectableInput } from "@lib/coinSelect";
import { p2pkhScript } from "@lib/script";
import { buildTx } from "@lib/tx";
import { PrivateKey } from "@radiantblockchain/radiantjs";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../db";
import { feeRate, wallet } from "@app/signals";
import { electrumWorker } from "@app/electrum/Electrum";

interface Props {
  asset: TxO;
  onSuccess?: (txid: string) => void;
  disclosure: UseDisclosureProps;
}

export default function MeltDigitalObject({
  asset,
  onSuccess,
  disclosure,
}: Props) {
  const { isOpen, onClose } = disclosure;
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const toast = useToast();

  const rxd = useLiveQuery(
    () => db.txo.where({ contractType: ContractType.RXD, spent: 0 }).toArray(),
    [],
    []
  );

  useEffect(() => {
    setSuccess(true);
    setLoading(false);
  }, [isOpen]);

  if (!isOpen || !onClose) return null;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(true);
    setLoading(true);

    const required: SelectableInput = { ...asset, required: true };
    const coins: SelectableInput[] = [required, ...rxd.slice()];

    const changeScript = p2pkhScript(wallet.value.address);

    const selected = coinSelect(
      wallet.value.address,
      coins,
      [],
      changeScript,
      feeRate.value
    );
    if (!selected.inputs?.length) {
      setErrorMessage(t`Insufficient funds`);
      setSuccess(false);
      setLoading(false);
      return;
    }

    selected.inputs[0].script = asset.script;

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
      db.broadcast.put({ txid, date: Date.now(), description: "nft_melt" });
      onSuccess && onSuccess(txid);
      toast({ status: "success", title: t`Token melted` });
    } catch (error) {
      setErrorMessage(t`Transaction rejected`);
      setSuccess(false);
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <form onSubmit={submit}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{t`Melt token`}</ModalHeader>
          <ModalCloseButton />
          <ModalBody pb={6}>
            {success || (
              <Alert status="error" mb={4}>
                <AlertIcon />
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            <Flex direction="row" gap={4}>
              <WarningIcon fontSize="2xl" />
              {t`This will destroy your token! Are you sure?`}
            </Flex>
          </ModalBody>
          <ModalFooter>
            <Button
              type="submit"
              bgColor="red.600"
              _hover={{ bg: "red.500" }}
              isLoading={loading}
              mr={4}
            >
              {t`Melt`}
            </Button>
            <Button onClick={onClose}>{t`Cancel`}</Button>
          </ModalFooter>
        </ModalContent>
      </form>
    </Modal>
  );
}
