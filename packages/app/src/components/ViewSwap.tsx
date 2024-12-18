import { SmartToken, SmartTokenType } from "@app/types";
import { Box, Button, ButtonProps, Text, useClipboard } from "@chakra-ui/react";
import { CheckIcon, CopyIcon } from "@chakra-ui/icons";
import { PropsWithChildren, useState } from "react";
import { photonsToRXD } from "@lib/format";

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
}: {
  from: Asset;
  to: Asset;
  hex: string;
  BodyComponent: React.ComponentType<PropsWithChildren>;
  FooterComponent: React.ComponentType<PropsWithChildren>;
}) {
  const fromText = assetToText(from);
  const toText = assetToText(to);
  const text1 = `🔁 Swap: ${fromText} ➔ ${toText} 📋`;
  const text2 = "🟦";
  const [isHoveringCopyTx, setIsHoveringCopyTx] = useState(false);
  const [isHoveringCopyAll, setIsHoveringCopyAll] = useState(false);

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
      </BodyComponent>

      <FooterComponent>
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
      </FooterComponent>
    </>
  );
}
