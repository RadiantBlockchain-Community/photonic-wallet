import { SmartToken, SmartTokenType } from "@app/types";
import { Box, Button, ButtonProps, Text, useClipboard, useToast, HStack, Alert, AlertIcon } from "@chakra-ui/react";
import { CheckIcon, CopyIcon } from "@chakra-ui/icons";
import { PropsWithChildren, useState } from "react";
import { photonsToRXD } from "@lib/format";
import { electrumWorker } from "@app/electrum/Electrum";

type Asset = { glyph: SmartToken; value: number } | number;

const assetToText = (item: Asset) =>
  typeof item === "number"
    ? `${photonsToRXD(item)} RXD`
    : item.glyph.tokenType === SmartTokenType.FT
    ? `${item.value} ${item.glyph.ticker || item.glyph.name}`
    : `${item.glyph.name}`;

function CopyButton({ value, ...rest }: { value: string } & ButtonProps) {
  const { onCopy, hasCopied } = useClipboard(value);
  return (
    <Button
      leftIcon={hasCopied ? <CheckIcon color="green.400" /> : <CopyIcon />}
      onClick={onCopy}
      shadow="dark-md"
      {...rest}
    />
  );
}

export default function ViewSwap({
  from,
  to,
  hex,
  BodyComponent,
  FooterComponent,
  showBroadcast = true,
}: {
  from: Asset;
  to: Asset;
  hex: string;
  BodyComponent: React.ComponentType<PropsWithChildren>;
  FooterComponent: React.ComponentType<PropsWithChildren>;
  showBroadcast?: boolean;
}) {
  const toast = useToast();
  const fromText = assetToText(from);
  const toText = assetToText(to);
  const text1 = `🔁 Swap: ${fromText} ➔ ${toText} 📋`;
  const text2 = "🟦";
  const [isHoveringCopyTx, setIsHoveringCopyTx] = useState(false);
  const [isHoveringCopyAll, setIsHoveringCopyAll] = useState(false);
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastTxid, setBroadcastTxid] = useState<string | null>(null);

  const handleBroadcast = async () => {
    setIsBroadcasting(true);
    try {
      const txid = await electrumWorker.value.broadcast(hex);
      setBroadcastTxid(txid);
      toast({
        status: "success",
        title: "Swap broadcast to network!",
        description: `Transaction: ${txid.substring(0, 16)}...`,
      });
    } catch (error) {
      toast({
        status: "error",
        title: "Broadcast failed",
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsBroadcasting(false);
    }
  };

  return (
    <>
      <BodyComponent>
        <Box wordBreak="break-all" overflowWrap="break-word">
          <Text
            as="span"
            fontFamily="mono"
            lineHeight="shorter"
            textAlign="justify"
            bgColor={isHoveringCopyAll ? "lightBlue.900" : undefined}
          >
            {text1}
            <Text
              as="span"
              bgColor={
                isHoveringCopyAll || isHoveringCopyTx
                  ? "lightBlue.900"
                  : undefined
              }
            >
              {hex}
            </Text>
            {text2}
          </Text>
        </Box>
        {!showBroadcast && (
          <Alert status="info" mt={4}>
            <AlertIcon />
            This is a partially signed swap offer. Copy and share the hex locally.
            It cannot be broadcast directly until another party completes it.
          </Alert>
        )}
        {broadcastTxid && (
          <Alert status="success" mt={4}>
            <AlertIcon />
            Swap broadcast! TX: {broadcastTxid.substring(0, 16)}...
          </Alert>
        )}
      </BodyComponent>

      <FooterComponent>
        <HStack spacing={2} wrap="wrap" justify="center">
          <CopyButton
            value={hex}
            onMouseOver={() => setIsHoveringCopyTx(true)}
            onMouseOut={() => setIsHoveringCopyTx(false)}
          >
            Copy Tx
          </CopyButton>
          <CopyButton
            value={`${text1}${hex}${text2}`}
            variant="primary"
            onMouseOver={() => setIsHoveringCopyAll(true)}
            onMouseOut={() => setIsHoveringCopyAll(false)}
          >
            Copy All
          </CopyButton>
          {showBroadcast && !broadcastTxid && (
            <Button
              colorScheme="green"
              onClick={handleBroadcast}
              isLoading={isBroadcasting}
              loadingText="Broadcasting..."
              shadow="dark-md"
            >
              Broadcast to Network
            </Button>
          )}
        </HStack>
      </FooterComponent>
    </>
  );
}
