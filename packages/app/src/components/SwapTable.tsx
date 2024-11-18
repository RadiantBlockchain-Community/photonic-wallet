import db from "@app/db";
import createExplorerUrl from "@app/network/createExplorerUrl";
import { SmartToken, TokenSwap } from "@app/types";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Table,
  Thead,
  Tr,
  Th,
  Tbody,
  Td,
  Box,
  Flex,
  Icon,
  Image,
} from "@chakra-ui/react";
import { t } from "@lingui/macro";
import dayjs from "dayjs";
import { useLiveQuery } from "dexie-react-hooks";
import { MdOutlineSwapHoriz } from "react-icons/md";
import TokenContent from "./TokenContent";
import rxdIcon from "/rxd.png";

function TokenIcon({ glyph }: { glyph: SmartToken }) {
  return (
    <Box w={6} h={6}>
      <TokenContent glyph={glyph} thumbnail />
    </Box>
  );
}

function Description({ swap }: { swap: TokenSwap }) {
  const [toGlyph, fromGlyph] =
    useLiveQuery(async () => [
      swap.toGlyph
        ? await db.glyph.where({ ref: swap.toGlyph }).first()
        : undefined,
      swap.fromGlyph
        ? await db.glyph.where({ ref: swap.fromGlyph }).first()
        : undefined,
    ]) || [];

  const rxdImage = <Image src={rxdIcon} width={6} height={6} />;

  return (
    <Flex gap={2} alignItems="center">
      {fromGlyph ? <TokenIcon glyph={fromGlyph} /> : rxdImage}
      <Icon as={MdOutlineSwapHoriz} boxSize={6} color="gray.200" />
      {toGlyph ? <TokenIcon glyph={toGlyph} /> : rxdImage}
    </Flex>
  );
}

export default function SwapTable({
  swaps,
  actions,
}: {
  swaps: TokenSwap[];
  actions?: React.FunctionComponent<{ swap: TokenSwap }>;
}) {
  const ActionsComponent = actions;
  return (
    <Table size={{ base: "sm", xl: "md" }}>
      <Thead>
        <Tr>
          <Th display={{ base: "none", lg: "table-cell" }} />
          <Th>{t`TX ID`}</Th>
          <Th>{t`Swap`}</Th>
          <Th display={{ base: "none", md: "table-cell" }}>{t`Date`}</Th>
          {ActionsComponent && <Th></Th>}
          <Th width="50px" />
          <Th display={{ base: "none", lg: "table-cell" }} />
        </Tr>
      </Thead>
      <Tbody fontFamily="mono">
        {swaps
          ?.filter((swap) => !!swap.txid)
          .map((swap) => (
            <Tr key={swap.txid}>
              <Td display={{ base: "none", lg: "table-cell" }} />
              <Td>
                {swap.txid.substring(0, 4)}…{swap.txid.substring(60, 64)}
              </Td>
              <Td>
                <Description swap={swap} />
              </Td>
              <Td display={{ base: "none", md: "table-cell" }}>
                {swap.date ? dayjs(swap.date).format("L LT") : "…"}
              </Td>
              {ActionsComponent && (
                <Td textAlign="right">
                  <ActionsComponent swap={swap} />
                </Td>
              )}
              <Td>
                <a href={createExplorerUrl(swap.txid)} target="_blank">
                  <ExternalLinkIcon />
                </a>
              </Td>
              <Td display={{ base: "none", lg: "table-cell" }} />
            </Tr>
          ))}
      </Tbody>
    </Table>
  );
}
