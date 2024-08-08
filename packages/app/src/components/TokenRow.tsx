import { Box, Flex, Icon, Text } from "@chakra-ui/react";
import Outpoint from "@lib/Outpoint";
import { SmartToken } from "@app/types";
import { Link } from "react-router-dom";
import Identifier from "@app/components/Identifier";
import TokenContent from "@app/components/TokenContent";
import { TbBox, TbUserCircle } from "react-icons/tb";
import { IconType } from "react-icons/lib";
import ValueTag from "./ValueTag";
import { formatPhotons } from "@lib/format";

const Ref = ({ value }: { value: string }) => {
  const ref = Outpoint.fromString(value);
  return (
    <Identifier showCopy copyValue={ref.ref()}>
      {ref.shortInput()}
    </Identifier>
  );
};

export default function TokenRow({
  glyph,
  value,
  to,
  defaultIcon,
}: {
  glyph: SmartToken;
  value: number;
  to: string;
  size?: "sm" | "md";
  defaultIcon?: IconType;
}) {
  const ref = Outpoint.fromString(glyph?.ref || "");

  const short = ref.shortInput();
  return (
    <Flex
      bgGradient="linear(to-b, bg.100, bg.300)"
      alignItems="center"
      p={2}
      pr={4}
      mb={4}
      gap={2}
      borderRadius="md"
      overflow="hidden"
      as={Link}
      to={to}
      w="100%"
      maxW={{ lg: "container.md" }}
      mx="auto"
    >
      <Box w="48px" h="48px" /*sx={{ "& > *": { w: "64px", h: "64px" } }}*/>
        <TokenContent glyph={glyph} defaultIcon={defaultIcon} thumbnail />
      </Box>
      <Box flexGrow={1}>
        <Flex gap={2}>
          {glyph.type === "user" && <Icon as={TbUserCircle} fontSize="2xl" />}
          {glyph.type === "container" && <Icon as={TbBox} fontSize="2xl" />}
          {glyph.name ? (
            <Text
              as="div"
              fontWeight="500"
              color="lightBlue.A400"
              whiteSpace="nowrap"
              overflow="hidden"
              textOverflow="ellipsis"
              ml={1}
            >
              {glyph.name}
            </Text>
          ) : (
            <Identifier>{short}</Identifier>
          )}
          <Text as="div" color="gray.400">
            {(glyph.ticker as string) || ""}
          </Text>
        </Flex>
        <Ref value={glyph.ref} />
      </Box>
      <ValueTag>{formatPhotons(value)}</ValueTag>
    </Flex>
  );
}
