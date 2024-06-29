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
import { SmartToken, ContractType } from "@app/types";
import { WarningIcon } from "@chakra-ui/icons";
import coinSelect, { SelectableInput } from "@lib/coinSelect";
import { ftScript, p2pkhScript } from "@lib/script";
import { buildTx } from "@lib/tx";
import { PrivateKey } from "@radiantblockchain/radiantjs";
import { useLiveQuery } from "dexie-react-hooks";
import db from "../db";
import { feeRate, wallet } from "@app/signals";
import { reverseRef } from "@lib/Outpoint";
import { electrumWorker } from "@app/electrum/Electrum";

interface Props {
  glyph: SmartToken;
  onSuccess?: (txid: string) => void;
  disclosure: UseDisclosureProps;
}

export default function MeltFungible({ glyph, onSuccess, disclosure }: Props) {
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
    melt().catch((error) => {
      console.log(error);
      toast({
        title: t`Error`,
        description: "Could not melt",
        status: "error",
      });
      setLoading(false);
    });
  };

  const melt = async () => {
    setSuccess(true);
    setLoading(true);

    const refLE = reverseRef(glyph.ref);
    const fromScript = ftScript(wallet.value.address, refLE);
    const tokens = await db.txo
      .where({ script: fromScript, spent: 0 })
      .toArray();

    const required: SelectableInput[] = tokens.map((token) => ({
      ...token,
      required: true,
    }));
    const coins: SelectableInput[] = [...rxd.slice()];

    const changeScript = p2pkhScript(wallet.value.address);

    const selected = coinSelect(
      wallet.value.address,
      [...required, ...coins],
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
      onSuccess && onSuccess(txid);
      toast({ status: "success", title: t`Tokens melted` });
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
          <ModalHeader>{t`Melt tokens`}</ModalHeader>
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
              {t`This will destroy your tokens! Are you sure?`}
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
