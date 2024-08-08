import { CheckIcon, CopyIcon } from "@chakra-ui/icons";
import {
  Code,
  CodeProps,
  IconButton,
  Tooltip,
  useClipboard,
  useToken,
} from "@chakra-ui/react";
import React from "react";

export default function Identifier({
  showCopy = false,
  copyValue,
  children,
  ...rest
}: {
  showCopy?: boolean;
  copyValue?: string;
  children: React.ReactNode;
} & CodeProps) {
  const { onCopy, hasCopied } = useClipboard(`${copyValue || children}`);
  const label = "Copy to clipboard";
  // Multiline left and right padding on span
  const [bg] = useToken("colors", ["blackAlpha.400"]);

  const shadow = `4px 0 0 ${bg}`;

  return (
    <>
      <Code
        wordBreak="break-word"
        display="inline"
        verticalAlign="middle"
        py={1}
        mx={1}
        bgColor="blackAlpha.400"
        boxDecorationBreak="clone"
        boxShadow={`${shadow}, -${shadow}`}
        lineHeight={6}
        {...rest}
      >
        {children}
      </Code>

      {showCopy && (
        <Tooltip label={label}>
          <IconButton
            display="inline"
            onClick={onCopy}
            icon={
              hasCopied ? <CheckIcon color="green.400" /> : <CopyIcon />
            }
            variant="ghost"
            aria-label={label}
            size="xs"
          />
        </Tooltip>
      )}
    </>
  );
}
