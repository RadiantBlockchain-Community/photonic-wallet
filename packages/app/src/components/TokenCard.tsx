import { Box, Flex, Icon, Text } from "@chakra-ui/react";
import Outpoint from "@lib/Outpoint";
import { SmartToken } from "@app/types";
import { Link } from "react-router-dom";
import Identifier from "@app/components/Identifier";
import Photons from "@app/components/Photons";
import TokenContent from "@app/components/TokenContent";
import { TbBox, TbUserCircle } from "react-icons/tb";
import { IconType } from "react-icons/lib";
import { LinkIcon } from "@chakra-ui/icons";
import { RiSwap2Line } from "react-icons/ri";

export default function TokenCard({
  glyph,
  value,
  to,
  size = "md",
  defaultIcon,
}: {
  glyph?: SmartToken;
  value: number;
  to: string;
  size?: "sm" | "md";
  defaultIcon?: IconType;
}) {
  const ref = Outpoint.fromString(glyph?.ref || "");
  const isLink = !!glyph?.location;

  const short = ref.shortInput();
  return (
    <Box borderRadius="md" overflow="hidden" as={Link} to={to}>
      <Box
        bgGradient="linear(to-b, bg.100, bg.300)"
        height={size === "sm" ? "175px" : "250px"}
        display="flex"
        position="relative"
        alignItems="center"
        justifyContent="center"
        p={2}
      >
        {isLink && (
          <Box
            position="absolute"
            top={2}
            right={2}
            bgColor="blackAlpha.400"
            p={2}
            borderRadius={4}
          >
            <LinkIcon boxSize={8} />
          </Box>
        )}
        {glyph?.swapPending && (
          <Box
            position="absolute"
            bottom={2}
            right={2}
            bgColor="blackAlpha.400"
            p={2}
            borderRadius={4}
          >
            <Icon as={RiSwap2Line} boxSize={8} />
          </Box>
        )}
        <TokenContent glyph={glyph} defaultIcon={defaultIcon} thumbnail />
      </Box>
      <Flex
        p={2}
        pr={3}
        bg="bg.100"
        alignItems="center"
        justifyContent="space-between"
        gap={2}
        lineHeight={8}
      >
        <Flex alignItems="center">
          {glyph?.type === "user" && <Icon as={TbUserCircle} fontSize="2xl" />}
          {glyph?.type === "container" && <Icon as={TbBox} fontSize="2xl" />}
          {glyph?.name ? (
            <Text
              fontWeight="500"
              color="lightBlue.A400"
              whiteSpace="nowrap"
              overflow="hidden"
              textOverflow="ellipsis"
              ml={1}
            >
              {glyph?.name}
            </Text>
          ) : (
            <Identifier>{short}</Identifier>
          )}
        </Flex>
        <Text whiteSpace="nowrap" fontFamily="mono">
          <Photons value={value} />
        </Text>
      </Flex>
    </Box>
  );
}
