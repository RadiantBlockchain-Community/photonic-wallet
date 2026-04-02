import React, { useState } from "react";
import {
  Box,
  VStack,
  HStack,
  FormControl,
  FormLabel,
  Input,
  Button,
  Text,
  Alert,
  AlertIcon,
  AlertDescription,
  useToast,
  Icon,
} from "@chakra-ui/react";
import { MdLock, MdLockOpen, MdTimer } from "react-icons/md";
import { Trans, t } from "@lingui/macro";
import { GlyphV2Metadata } from "@lib/v2metadata";
import { decryptWithPassword } from "@lib/crypto";
import { isUnlocked, getTimeRemaining, formatTimeRemaining } from "@lib/timelock";
import { GLYPH_ENCRYPTED, GLYPH_TIMELOCK } from "@lib/protocols";

type EncryptedContentUnlockProps = {
  metadata: GlyphV2Metadata;
  encryptedContent: {
    algorithm: string;
    ciphertext: Uint8Array;
    nonce: Uint8Array;
    tag: Uint8Array;
    salt?: Uint8Array;
  };
  onDecrypted: (content: Uint8Array) => void;
};

export default function EncryptedContentUnlock({
  metadata,
  encryptedContent,
  onDecrypted,
}: EncryptedContentUnlockProps) {
  const [password, setPassword] = useState("");
  const [isDecrypting, setIsDecrypting] = useState(false);
  const toast = useToast();

  const isTimelocked = metadata.p.includes(GLYPH_TIMELOCK);
  const unlocked = isUnlocked(metadata);
  const timeRemaining = isTimelocked ? getTimeRemaining(metadata) : 0;

  const handleDecrypt = async () => {
    if (!password) {
      toast({
        title: t`Password Required`,
        description: t`Please enter the decryption password`,
        status: "warning",
      });
      return;
    }

    setIsDecrypting(true);

    try {
      const decrypted = await decryptWithPassword(
        {
          algorithm: encryptedContent.algorithm as any,
          ciphertext: encryptedContent.ciphertext,
          nonce: encryptedContent.nonce,
          tag: encryptedContent.tag,
          salt: encryptedContent.salt,
        },
        password
      );

      toast({
        title: t`Content Decrypted!`,
        description: t`Successfully unlocked encrypted content`,
        status: "success",
      });

      onDecrypted(decrypted);
      setPassword("");
    } catch (error) {
      console.error("Decryption error:", error);
      toast({
        title: t`Decryption Failed`,
        description: t`Invalid password or corrupted content`,
        status: "error",
        duration: 5000,
      });
    } finally {
      setIsDecrypting(false);
    }
  };

  return (
    <Box borderWidth={1} borderRadius="md" p={4} bg="bg.400">
      <VStack spacing={4} align="stretch">
        <HStack>
          <Icon as={MdLock} fontSize="2xl" color="blue.400" />
          <VStack align="start" spacing={0}>
            <Text fontWeight="bold">
              <Trans>Encrypted Content</Trans>
            </Text>
            <Text fontSize="sm" color="gray.400">
              {encryptedContent.algorithm.toUpperCase()}
            </Text>
          </VStack>
        </HStack>

        {isTimelocked && !unlocked && (
          <Alert status="warning" borderRadius="md">
            <AlertIcon as={MdTimer} />
            <AlertDescription>
              <VStack align="start" spacing={1}>
                <Text fontWeight="bold">
                  <Trans>Timelocked Content</Trans>
                </Text>
                <Text>
                  <Trans>
                    This content will unlock in {formatTimeRemaining(timeRemaining)}
                  </Trans>
                </Text>
              </VStack>
            </AlertDescription>
          </Alert>
        )}

        {isTimelocked && unlocked && (
          <Alert status="success" borderRadius="md">
            <AlertIcon as={MdLockOpen} />
            <AlertDescription>
              <Trans>Timelock has expired - content can now be decrypted</Trans>
            </AlertDescription>
          </Alert>
        )}

        {(!isTimelocked || unlocked) && (
          <>
            <FormControl>
              <FormLabel>
                <Trans>Decryption Password</Trans>
              </FormLabel>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t`Enter password`}
                onKeyPress={(e) => e.key === "Enter" && handleDecrypt()}
              />
            </FormControl>

            {(metadata.app as any)?.timelock?.hint && (
              <Text fontSize="sm" color="gray.400">
                <Trans>Hint:</Trans> {(metadata.app as any).timelock.hint}
              </Text>
            )}

            <Button
              colorScheme="blue"
              onClick={handleDecrypt}
              isLoading={isDecrypting}
              isDisabled={!password}
              loadingText={t`Decrypting...`}
              leftIcon={<Icon as={MdLockOpen} />}
            >
              <Trans>Decrypt Content</Trans>
            </Button>
          </>
        )}
      </VStack>
    </Box>
  );
}
