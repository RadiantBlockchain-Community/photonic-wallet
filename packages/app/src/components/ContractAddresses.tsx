import {
  Box,
  VStack,
  HStack,
  IconButton,
  Tooltip,
  useClipboard,
  Text,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  FormControl,
  FormLabel,
  Code,
} from "@chakra-ui/react";
import { CheckIcon, CopyIcon, ExternalLinkIcon } from "@chakra-ui/icons";
import { t } from "@lingui/macro";
import { useState, useMemo } from "react";
import createExplorerUrl from "@app/network/createExplorerUrl";
import { Link as RouterLink } from "react-router-dom";

interface ContractAddressesProps {
  linkRef: string; // The base link ref (e.g., "6adceafa...00000000")
  numContracts?: number; // Number of contracts if known from metadata
}

const MAX_CONTRACTS = 32;

/**
 * Generates mining contract addresses from a link ref.
 * 
 * Link ref format: [32-byte txid hex][4-byte vout hex, big-endian]
 * Example: 6adceafa624357085c0522356e88c3ffa3199d0d58d8407fe13771d2be74376800000000
 * 
 * Contract 1: ...00000001
 * Contract 2: ...00000002
 * etc.
 */
function generateContractRefs(linkRef: string, count: number): string[] {
  if (linkRef.length !== 72) {
    console.warn("Invalid link ref length:", linkRef.length);
    return [];
  }
  
  // Extract base txid (first 64 chars = 32 bytes)
  const baseTxid = linkRef.substring(0, 64);
  
  const contracts: string[] = [];
  for (let i = 1; i <= count; i++) {
    // Convert contract number to 4-byte big-endian hex
    const voutHex = i.toString(16).padStart(8, '0');
    contracts.push(baseTxid + voutHex);
  }
  
  return contracts;
}

function ContractRow({ contractRef, index }: { contractRef: string; index: number }) {
  const { onCopy, hasCopied } = useClipboard(contractRef);
  const shortRef = `${contractRef.substring(0, 8)}...${contractRef.substring(64)}`;
  
  return (
    <HStack 
      w="100%" 
      justify="space-between" 
      p={2} 
      borderRadius="md" 
      bg="blackAlpha.300"
      _hover={{ bg: "blackAlpha.400" }}
    >
      <Text fontSize="sm" fontWeight="medium" minW="80px">
        {t`Contract`} {index}
      </Text>
      <Code 
        fontSize="xs" 
        bg="transparent" 
        color="inherit"
        flex={1}
        isTruncated
      >
        {shortRef}
      </Code>
      <HStack gap={1}>
        <Tooltip label={hasCopied ? t`Copied!` : t`Copy full address`}>
          <IconButton
            icon={hasCopied ? <CheckIcon color="green.400" /> : <CopyIcon />}
            onClick={onCopy}
            variant="ghost"
            size="xs"
            aria-label={t`Copy contract address`}
          />
        </Tooltip>
        <Tooltip label={t`View on explorer`}>
          <IconButton
            as={RouterLink}
            to={createExplorerUrl(contractRef)}
            target="_blank"
            icon={<ExternalLinkIcon />}
            variant="ghost"
            size="xs"
            aria-label={t`View on explorer`}
          />
        </Tooltip>
      </HStack>
    </HStack>
  );
}

export default function ContractAddresses({ linkRef, numContracts: initialCount }: ContractAddressesProps) {
  const [count, setCount] = useState(
    Math.max(1, Math.min(MAX_CONTRACTS, initialCount || 1))
  );
  
  const contractRefs = useMemo(() => {
    const safeCount = Math.max(1, Math.min(MAX_CONTRACTS, count));
    return generateContractRefs(linkRef, safeCount);
  }, [linkRef, count]);
  
  if (!linkRef || linkRef.length !== 72) {
    return null;
  }
  
  return (
    <Box>
      {!initialCount && (
        <FormControl mb={3}>
          <FormLabel fontSize="xs" color="gray.400">
            {t`Number of contracts`}
          </FormLabel>
          <NumberInput 
            size="sm" 
            min={1} 
            max={MAX_CONTRACTS}
            value={count}
            onChange={(_, val) =>
              setCount(Math.max(1, Math.min(MAX_CONTRACTS, val || 1)))
            }
          >
            <NumberInputField />
            <NumberInputStepper>
              <NumberIncrementStepper />
              <NumberDecrementStepper />
            </NumberInputStepper>
          </NumberInput>
        </FormControl>
      )}
      
      <VStack spacing={1} align="stretch" maxH="300px" overflowY="auto">
        {contractRefs.map((ref, idx) => (
          <ContractRow key={ref} contractRef={ref} index={idx + 1} />
        ))}
      </VStack>
      
      {contractRefs.length === 0 && (
        <Text fontSize="sm" color="gray.500">
          {t`Invalid link reference`}
        </Text>
      )}
    </Box>
  );
}
