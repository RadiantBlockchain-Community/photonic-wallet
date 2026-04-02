import React, { useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  Textarea,
  Text,
  VStack,
  HStack,
  Alert,
  AlertIcon,
  AlertTitle,
  AlertDescription,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  useToast,
} from "@chakra-ui/react";
import { t, Trans } from "@lingui/macro";
import { burnNft, burnFt } from "@lib/burn";
import { parseFtScript, parseNftScript } from "@lib/script";
import { photonsToRXD } from "@lib/format";
import { wallet, feeRate } from "@app/signals";
import { electrumWorker } from "@app/electrum/Electrum";
import db from "@app/db";
import { ContractType } from "@app/types";

type BurnTokenModalProps = {
  isOpen: boolean;
  onClose: () => void;
  tokenUtxo: {
    txid: string;
    vout: number;
    script: string;
    value: number;
  };
  tokenType: "nft" | "ft";
  tokenName?: string;
  onBurnSuccess?: () => void;
};

export default function BurnTokenModal({
  isOpen,
  onClose,
  tokenUtxo,
  tokenType,
  tokenName,
  onBurnSuccess,
}: BurnTokenModalProps) {
  const [reason, setReason] = useState("");
  const [burnAmount, setBurnAmount] = useState(tokenUtxo.value);
  const [isLoading, setIsLoading] = useState(false);
  const toast = useToast();

  const handleBurn = async () => {
    if (!wallet.value.wif) {
      toast({
        title: t`Error`,
        description: t`Wallet not unlocked`,
        status: "error",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Get RXD UTXOs for fees
      const rxdUtxos = await db.txo
        .where({ contractType: ContractType.RXD, spent: 0 })
        .toArray();

      let result;
      
      if (tokenType === "nft") {
        result = burnNft(
          wallet.value.address,
          wallet.value.wif,
          tokenUtxo,
          rxdUtxos,
          reason || undefined,
          feeRate.value
        );
      } else {
        // FT burn
        if (burnAmount <= 0 || burnAmount > tokenUtxo.value) {
          toast({
            title: t`Invalid Amount`,
            description: t`Burn amount must be between 1 and ${tokenUtxo.value}`,
            status: "error",
          });
          setIsLoading(false);
          return;
        }

        result = burnFt(
          wallet.value.address,
          wallet.value.wif,
          tokenUtxo,
          burnAmount,
          rxdUtxos,
          reason || undefined,
          feeRate.value
        );
      }

      // Broadcast transaction
      const txid = await electrumWorker.value.broadcast(result.tx.toString());

      // Record in database
      await db.broadcast.put({
        txid,
        date: Date.now(),
        description: `burn_${tokenType}`,
      });

      toast({
        title: t`Token Burned Successfully`,
        description: (
          <VStack align="start" spacing={1}>
            <Text>
              <Trans>Transaction ID: {txid.substring(0, 16)}...</Trans>
            </Text>
            <Text>
              <Trans>
                Photons returned: {photonsToRXD(result.photonsReturned)} RXD
              </Trans>
            </Text>
          </VStack>
        ),
        status: "success",
        duration: 10000,
        isClosable: true,
      });

      onBurnSuccess?.();
      onClose();
    } catch (error) {
      console.error("Burn error:", error);
      toast({
        title: t`Burn Failed`,
        description: String(error),
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const photonsReturned = tokenType === "nft" 
    ? tokenUtxo.value 
    : (tokenUtxo.value - burnAmount);

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent bg="bg.500">
        <ModalHeader>
          <Trans>Burn Token</Trans>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <Alert status="warning" borderRadius="md">
              <AlertIcon />
              <VStack align="start" spacing={1}>
                <AlertTitle>
                  <Trans>Warning: This action is irreversible!</Trans>
                </AlertTitle>
                <AlertDescription>
                  <Trans>
                    Burning will permanently destroy this token. The photons
                    will be returned to your wallet.
                  </Trans>
                </AlertDescription>
              </VStack>
            </Alert>

            {tokenName && (
              <FormControl>
                <FormLabel>
                  <Trans>Token Name</Trans>
                </FormLabel>
                <Text fontWeight="bold">{tokenName}</Text>
              </FormControl>
            )}

            {tokenType === "ft" && (
              <FormControl>
                <FormLabel>
                  <Trans>Amount to Burn</Trans>
                </FormLabel>
                <NumberInput
                  value={burnAmount}
                  onChange={(_, value) => setBurnAmount(value)}
                  min={1}
                  max={tokenUtxo.value}
                >
                  <NumberInputField />
                  <NumberInputStepper>
                    <NumberIncrementStepper />
                    <NumberDecrementStepper />
                  </NumberInputStepper>
                </NumberInput>
                <Text fontSize="sm" color="gray.400" mt={1}>
                  <Trans>
                    Available: {tokenUtxo.value} tokens
                  </Trans>
                </Text>
              </FormControl>
            )}

            <FormControl>
              <FormLabel>
                <Trans>Reason (Optional)</Trans>
              </FormLabel>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t`e.g., Upgrading to v2, Reducing supply, etc.`}
                rows={3}
              />
            </FormControl>

            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <VStack align="start" spacing={1}>
                <Text fontWeight="bold">
                  <Trans>Photons to be returned:</Trans>
                </Text>
                <Text fontSize="lg" color="green.300">
                  {photonsToRXD(photonsReturned)} RXD
                </Text>
              </VStack>
            </Alert>
          </VStack>
        </ModalBody>

        <ModalFooter>
          <HStack spacing={3}>
            <Button variant="ghost" onClick={onClose} isDisabled={isLoading}>
              <Trans>Cancel</Trans>
            </Button>
            <Button
              colorScheme="red"
              onClick={handleBurn}
              isLoading={isLoading}
              loadingText={t`Burning...`}
            >
              <Trans>Burn Token</Trans>
            </Button>
          </HStack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
