import React, { useState } from "react";
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
  Box,
  Divider,
  useToast,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Badge,
  IconButton,
  Textarea,
} from "@chakra-ui/react";
import { AddIcon, DeleteIcon } from "@chakra-ui/icons";
import { t, Trans } from "@lingui/macro";
import { useLiveQuery } from "dexie-react-hooks";
import PageHeader from "@app/components/PageHeader";
import ContentContainer from "@app/components/ContentContainer";
import { wallet, feeRate } from "@app/signals";
import { mintToken } from "@lib/mint";
import { createAuthority, isAuthorityExpired } from "@lib/authority";
import { electrumWorker } from "@app/electrum/Electrum";
import db from "@app/db";
import { ContractType } from "@app/types";
import { useNavigate } from "react-router-dom";

export default function AuthorityManager() {
  const [name, setName] = useState("");
  const [scope, setScope] = useState("");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [newPermission, setNewPermission] = useState("");
  const [expires, setExpires] = useState("");
  const [revocable, setRevocable] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const toast = useToast();
  const navigate = useNavigate();

  const utxos = useLiveQuery(
    () => db.txo.where({ contractType: ContractType.RXD, spent: 0 }).toArray(),
    []
  );

  const addPermission = () => {
    if (newPermission && !permissions.includes(newPermission)) {
      setPermissions([...permissions, newPermission]);
      setNewPermission("");
    }
  };

  const removePermission = (perm: string) => {
    setPermissions(permissions.filter((p) => p !== perm));
  };

  const handleCreate = async () => {
    if (!wallet.value.wif || !utxos) {
      toast({
        title: t`Error`,
        description: t`Wallet not unlocked or UTXOs not loaded`,
        status: "error",
      });
      return;
    }

    if (!name) {
      toast({
        title: t`Name Required`,
        description: t`Please enter an authority name`,
        status: "error",
      });
      return;
    }

    setIsLoading(true);

    try {
      // Create authority metadata
      const metadata = createAuthority(wallet.value.address, {
        name,
        scope,
        permissions: permissions.length > 0 ? permissions : undefined,
        expires: expires ? new Date(expires).toISOString() : undefined,
        revocable,
      });

      // Mint authority token
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
        description: "authority_commit",
      });

      const revealTxId = await electrumWorker.value.broadcast(revealTx.toString());
      await db.broadcast.put({
        txid: revealTxId,
        date: Date.now(),
        description: "authority_reveal",
      });

      toast({
        title: t`Authority Token Created!`,
        description: (
          <VStack align="start" spacing={1}>
            <Text>
              <Trans>Authority: {name}</Trans>
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

      // Reset form
      setName("");
      setScope("");
      setPermissions([]);
      setExpires("");
      setRevocable(true);
    } catch (error) {
      console.error("Authority creation error:", error);
      toast({
        title: t`Creation Failed`,
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
        {t`Authority Token Manager`}
      </PageHeader>

      <ContentContainer>
        <Tabs colorScheme="blue">
          <TabList>
            <Tab>
              <Trans>Create Authority</Trans>
            </Tab>
            <Tab>
              <Trans>My Authorities</Trans>
            </Tab>
          </TabList>

          <TabPanels>
            <TabPanel>
              <VStack spacing={6} align="stretch">
                <FormControl isRequired>
                  <FormLabel>
                    <Trans>Authority Name</Trans>
                  </FormLabel>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t`Admin Authority`}
                  />
                  <FormHelperText>
                    <Trans>A descriptive name for this authority</Trans>
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>
                    <Trans>Scope</Trans>
                  </FormLabel>
                  <Input
                    value={scope}
                    onChange={(e) => setScope(e.target.value)}
                    placeholder={t`marketplace, governance, etc.`}
                  />
                  <FormHelperText>
                    <Trans>What this authority governs</Trans>
                  </FormHelperText>
                </FormControl>

                <FormControl>
                  <FormLabel>
                    <Trans>Permissions</Trans>
                  </FormLabel>
                  <HStack>
                    <Input
                      value={newPermission}
                      onChange={(e) => setNewPermission(e.target.value)}
                      placeholder={t`create_listing, approve_trades, etc.`}
                      onKeyPress={(e) => e.key === "Enter" && addPermission()}
                    />
                    <IconButton
                      aria-label={t`Add permission`}
                      icon={<AddIcon />}
                      onClick={addPermission}
                      colorScheme="blue"
                    />
                  </HStack>
                  <FormHelperText>
                    <Trans>List of permissions granted by this authority</Trans>
                  </FormHelperText>
                  
                  {permissions.length > 0 && (
                    <Box mt={3}>
                      <HStack spacing={2} flexWrap="wrap">
                        {permissions.map((perm) => (
                          <Badge
                            key={perm}
                            colorScheme="blue"
                            display="flex"
                            alignItems="center"
                            gap={1}
                            px={2}
                            py={1}
                          >
                            {perm}
                            <IconButton
                              aria-label={t`Remove`}
                              icon={<DeleteIcon />}
                              size="xs"
                              variant="ghost"
                              onClick={() => removePermission(perm)}
                            />
                          </Badge>
                        ))}
                      </HStack>
                    </Box>
                  )}
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

                <FormControl display="flex" alignItems="center">
                  <FormLabel mb={0}>
                    <Trans>Revocable</Trans>
                  </FormLabel>
                  <input
                    type="checkbox"
                    checked={revocable}
                    onChange={(e) => setRevocable(e.target.checked)}
                    aria-label="Revocable"
                  />
                  <FormHelperText ml={3} mb={0}>
                    <Trans>Can this authority be revoked later?</Trans>
                  </FormHelperText>
                </FormControl>

                <Divider />

                <Button
                  colorScheme="blue"
                  size="lg"
                  onClick={handleCreate}
                  isLoading={isLoading}
                  isDisabled={!name}
                  loadingText={t`Creating...`}
                >
                  <Trans>Create Authority Token</Trans>
                </Button>
              </VStack>
            </TabPanel>

            <TabPanel>
              <VStack spacing={4} align="stretch">
                <Text color="gray.400">
                  <Trans>
                    Your authority tokens will appear here once created. This
                    feature requires indexer integration to display existing
                    authorities.
                  </Trans>
                </Text>
              </VStack>
            </TabPanel>
          </TabPanels>
        </Tabs>
      </ContentContainer>
    </Container>
  );
}
