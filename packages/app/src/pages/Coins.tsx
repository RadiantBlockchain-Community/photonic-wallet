import { useLocation } from "react-router-dom";
import { t } from "@lingui/macro";
import { Table, Tbody, Td, Th, Thead, Tr } from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import PageHeader from "@app/components/PageHeader";
import ContentContainer from "@app/components/ContentContainer";
import { ContractType } from "@app/types";
import Photons from "@app/components/Photons";
import useTxoQuery from "@app/hooks/useTxoQuery";
import Pagination from "@app/components/Pagination";
import useQueryString from "@app/hooks/useQueryString";
import createExplorerUrl from "@app/network/createExplorerUrl";

const pageSize = 20;

export default function Coins() {
  const { pathname } = useLocation();
  const { p: pageParam } = useQueryString();
  const page = parseInt(pageParam || "0", 10);
  const utxos = useTxoQuery(
    ({ contractType, spent }) =>
      contractType === ContractType.RXD && spent === 0,
    pageSize,
    page
  );
  return (
    <ContentContainer>
      <PageHeader
        toolbar={
          <Pagination
            page={page}
            startUrl={pathname}
            prevUrl={`${pathname}${page > 1 ? `?p=${page - 1}` : ""}`}
            nextUrl={
              utxos.length == pageSize + 1
                ? `${pathname}?p=${page + 1}`
                : undefined
            }
          />
        }
      >
        {t`Coins`}
      </PageHeader>
      <Table size={{ base: "sm", xl: "md" }}>
        <Thead>
          <Tr>
            <Th display={{ base: "none", lg: "table-cell" }} />
            <Th>{t`TX ID`}</Th>
            <Th>{t`Block`}</Th>
            <Th textAlign="right">{t`Value`}</Th>
            <Th width="50px" />
            <Th display={{ base: "none", lg: "table-cell" }} />
          </Tr>
        </Thead>
        <Tbody fontFamily="mono">
          {utxos.slice(0, pageSize).map(({ txid, vout, value, height }) => (
            <Tr key={`${txid}${vout}`}>
              <Td display={{ base: "none", lg: "table-cell" }} />
              <Td>
                {txid.substring(0, 4)}…{txid.substring(60, 64)}
              </Td>
              <Td>{height === Infinity ? "…" : height}</Td>
              <Td textAlign="right">
                <Photons value={value} />
              </Td>
              <Td>
                <a href={createExplorerUrl(txid)} target="_blank">
                  <ExternalLinkIcon />
                </a>
              </Td>
              <Td display={{ base: "none", lg: "table-cell" }} />
            </Tr>
          ))}
        </Tbody>
      </Table>
    </ContentContainer>
  );
}
