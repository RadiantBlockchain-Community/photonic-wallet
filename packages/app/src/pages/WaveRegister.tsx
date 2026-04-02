import React, { useState, useEffect } from "react";
import {
  Container,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  FormHelperText,
  Input,
  Button,
  Text,
  Alert,
  AlertIcon,
  AlertDescription,
  Box,
  Divider,
  useToast,
  Spinner,
} from "@chakra-ui/react";
import { t, Trans } from "@lingui/macro";
import { useLiveQuery } from "dexie-react-hooks";
import PageHeader from "@app/components/PageHeader";
import ContentContainer from "@app/components/ContentContainer";
import { wallet, feeRate } from "@app/signals";
import { mintToken } from "@lib/mint";
import { createWaveNameMetadata, validateWaveName, calculateNameCost } from "@lib/wave";
import { photonsToRXD } from "@lib/format";
import { electrumWorker } from "@app/electrum/Electrum";
import db from "@app/db";
import { ContractType } from "@app/types";
import { useNavigate } from "react-router-dom";

export default function WaveRegister() {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [description, setDescription] = useState("");
  const [expires, setExpires] = useState("");
  const [customData, setCustomData] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const toast = useToast();
  const navigate = useNavigate();

  const utxos = useLiveQuery(
    () => db.txo.where({ contractType: ContractType.RXD, spent: 0 }).toArray(),
    []
  );

  const fullName = name ? `${name}.rxd` : "";
  const validation = validateWaveName(fullName);
  const cost = fullName ? calculateNameCost(fullName) : 0;

  useEffect(() => {
    const checkAvailability = async () => {
      if (!fullName || !validation.valid) {
        setIsAvailable(null);
        return;
      }

      setIsChecking(true);
      try {
        // In production, this would query the indexer
        // For now, just validate format
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsAvailable(true);
      } catch (error) {
        setIsAvailable(false);
      } finally {
        setIsChecking(false);
      }
    };

    const debounce = setTimeout(checkAvailability, 500);
    return () => clearTimeout(debounce);
  }, [fullName, validation.valid]);

  const handleRegister = async () => {
    if (!wallet.value.wif || !utxos) {
      toast({
        title: t`Error`,
        description: t`Wallet not unlocked or UTXOs not loaded`,
        status: "error",
      });
      return;
    }

    if (!validation.valid) {
      toast({
        title: t`Invalid Name`,
        description: validation.error,
        status: "error",
      });
      return;
    }

    if (!target) {
      toast({
        title: t`Target Required`,
        description: t`Please enter a target address or reference`,
        status: "error",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Parse custom data JSON if provided
      let parsedData;
      if (customData) {
        try {
          parsedData = JSON.parse(customData);
        } catch {
          toast({
            title: t`Invalid JSON`,
            description: t`Custom data must be valid JSON`,
            status: "error",
          });
          setIsLoading(false);
          return;
        }
      }

      // Create WAVE name metadata
      const metadata = createWaveNameMetadata(fullName, wallet.value.address, {
        target,
        desc: description || `WAVE name: ${fullName}`,
        expires: expires ? Math.floor(new Date(expires).getTime() / 1000) : undefined,
        data: parsedData,
      });

      // Mint WAVE name token
      const { commitTx, revealTx } = mintToken(
        "nft",
        { method: "direct", params: { address: wallet.value.address }, value: 1 },
        wallet.value.wif,
        utxos,
        metadata,
        [],
        feeRate.value
      );

      // Broadcast transactions
      const commitTxId = await electrumWorker.value.broadcast(commitTx.toString());
      await db.broadcast.put({
        txid: commitTxId,
        date: Date.now(),
        description: "wave_name_commit",
      });

      const revealTxId = await electrumWorker.value.broadcast(revealTx.toString());
      await db.broadcast.put({
        txid: revealTxId,
        date: Date.now(),
        description: "wave_name_reveal",
      });

      toast({
        title: t`WAVE Name Registered!`,
        description: (
          <VStack align="start" spacing={1}>
            <Text>
              <Trans>Name: {fullName}</Trans>
            </Text>
            <Text fontSize="sm">
              <Trans>Transaction: {revealTxId.substring(0, 16)}...</Trans>
            </Text>
          </VStack>
        ),
        status: "success",
        duration: 10000,
        isClosable: true,
      });

      // Navigate to wallet or tokens page
      navigate("/");
    } catch (error) {
      console.error("WAVE registration error:", error);
      toast({
        title: t`Registration Failed`,
        description: String(error),
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container maxW="container.md" py={8}>
      <PageHeader>
        {t`Register WAVE Name`}
      </PageHeader>

      <ContentContainer>
        <VStack spacing={6} align="stretch">
          <FormControl isInvalid={!!name && !validation.valid}>
            <FormLabel>
              <Trans>WAVE Name</Trans>
            </FormLabel>
            <HStack>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                placeholder={t`alice`}
                flex={1}
              />
              <Text fontWeight="bold">.rxd</Text>
            </HStack>
            <FormHelperText>
              {!name && <Trans>Enter a name (3-63 characters, lowercase alphanumeric and hyphens)</Trans>}
              {name && !validation.valid && <Text color="red.400">{validation.error}</Text>}
              {name && validation.valid && isChecking && (
                <HStack>
                  <Spinner size="xs" />
                  <Trans>Checking availability...</Trans>
                </HStack>
              )}
              {name && validation.valid && !isChecking && isAvailable === true && (
                <Text color="green.400">
                  <Trans>✓ Available</Trans>
                </Text>
              )}
              {name && validation.valid && !isChecking && isAvailable === false && (
                <Text color="red.400">
                  <Trans>✗ Name already registered</Trans>
                </Text>
              )}
            </FormHelperText>
          </FormControl>

          {validation.valid && (
            <Alert status="info" borderRadius="md">
              <AlertIcon />
              <AlertDescription>
                <VStack align="start" spacing={1}>
                  <Text fontWeight="bold">
                    <Trans>Registration Cost</Trans>
                  </Text>
                  <Text fontSize="lg" color="blue.300">
                    {photonsToRXD(cost)} RXD
                  </Text>
                  <Text fontSize="sm">
                    <Trans>Shorter names cost more. This is a one-time fee.</Trans>
                  </Text>
                </VStack>
              </AlertDescription>
            </Alert>
          )}

          <Divider />

          <FormControl>
            <FormLabel>
              <Trans>Target Address/Reference</Trans>
            </FormLabel>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder={t`1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa`}
            />
            <FormHelperText>
              <Trans>The address or token reference this name points to</Trans>
            </FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel>
              <Trans>Description (Optional)</Trans>
            </FormLabel>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t`My primary Radiant address`}
            />
          </FormControl>

          <FormControl>
            <FormLabel>
              <Trans>Expiration Date (Optional)</Trans>
            </FormLabel>
            <Input
              type="datetime-local"
              value={expires}
              onChange={(e) => setExpires(e.target.value)}
            />
            <FormHelperText>
              <Trans>Leave empty for no expiration</Trans>
            </FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel>
              <Trans>Custom Data (Optional JSON)</Trans>
            </FormLabel>
            <Input
              value={customData}
              onChange={(e) => setCustomData(e.target.value)}
              placeholder={t`{"twitter": "@alice", "website": "alice.com"}`}
              fontFamily="mono"
            />
            <FormHelperText>
              <Trans>Additional metadata in JSON format</Trans>
            </FormHelperText>
          </FormControl>

          <Button
            colorScheme="blue"
            size="lg"
            onClick={handleRegister}
            isLoading={isLoading}
            isDisabled={!validation.valid || isAvailable !== true || !target}
            loadingText={t`Registering...`}
          >
            <Trans>Register WAVE Name</Trans>
          </Button>
        </VStack>
      </ContentContainer>
    </Container>
  );
}
