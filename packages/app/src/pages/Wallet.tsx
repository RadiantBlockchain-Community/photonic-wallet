import { useState } from "react";
import {
  Button,
  Grid,
  HStack,
  Icon,
  Menu,
  MenuButton,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
  Spacer,
} from "@chakra-ui/react";
import { Link, useLocation, useParams } from "react-router-dom";
import { t } from "@lingui/macro";
import NoContent from "@app/components/NoContent";
import useRestoreScroll from "@app/hooks/useRestoreScroll";
import TokenCard from "@app/components/TokenCard";
import useNftQuery from "@app/hooks/useNftQuery";
import Pagination from "@app/components/Pagination";
import PageHeader from "@app/components/PageHeader";
import ViewPanelLayout from "@app/layouts/ViewPanelLayout";
import useQueryString from "@app/hooks/useQueryString";
import ViewDigitalObject from "@app/components/ViewDigitalObject";
import { ChevronDownIcon, SmallCloseIcon } from "@chakra-ui/icons";
import MintMenu from "@app/components/MintMenu";
import ActionIcon from "@app/components/ActionIcon";
import { MdFilterAlt } from "react-icons/md";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@app/db";
import { TbBox } from "react-icons/tb";

const pageSize = 60;

export default function Wallet() {
  const { sref } = useParams();
  const { containerRef } = useParams();
  const context = containerRef ? `/container/${containerRef}` : "/objects";

  return (
    <ViewPanelLayout>
      <TokenGrid open={!!sref} />
      {sref && <ViewDigitalObject sref={sref} context={context} />}
    </ViewPanelLayout>
  );
}

function TokenGrid({ open }: { open: boolean }) {
  const allTypes = ["object", "container", "user"];
  const { pathname } = useLocation();
  const { p: pageParam } = useQueryString();
  const { containerRef } = useParams();
  const page = parseInt(pageParam || "0", 10);
  const [filterType, setFilterType] = useState<string[]>(allTypes);
  const nft = useNftQuery(
    (glyph) =>
      glyph.spent === 0 &&
      (filterType.length ? filterType.includes(glyph.type) : true) &&
      (containerRef ? glyph.container === containerRef : true),
    pageSize,
    page,
    [filterType, containerRef]
  );
  const context = containerRef ? `/container/${containerRef}` : "/objects";

  const container = useLiveQuery(() => {
    if (containerRef) {
      return db.glyph.get({ ref: containerRef });
    }
    return undefined;
  }, [containerRef]);

  useRestoreScroll();

  return (
    <>
      <PageHeader toolbar={<MintMenu />}>
        {container ? (
          <>
            <Icon as={TbBox} fontSize="2xl" mr={2} />
            {container.name}
          </>
        ) : (
          t`Non-Fungible Tokens`
        )}
      </PageHeader>

      <HStack height="42px" gap={4} mb={2} mx={4} alignItems="start">
        <Menu closeOnSelect={false}>
          <MenuButton
            as={Button}
            size="sm"
            aria-label={t`Filter`}
            leftIcon={<ActionIcon as={MdFilterAlt} />}
            rightIcon={<ChevronDownIcon />}
          >
            {t`Filter`}
          </MenuButton>
          <MenuList minWidth="240px">
            <MenuOptionGroup
              title="Type"
              type="checkbox"
              onChange={(types) => setFilterType(types as string[])}
            >
              <MenuItemOption value="object">{t`Object`}</MenuItemOption>
              <MenuItemOption value="container">{t`Container`}</MenuItemOption>
              <MenuItemOption value="user">{t`User`}</MenuItemOption>
            </MenuOptionGroup>
          </MenuList>
        </Menu>
        {container && (
          <Button
            size="sm"
            rightIcon={<SmallCloseIcon />}
            as={Link}
            to="/objects"
          >
            {container.name}
          </Button>
        )}
        <Spacer />
        <Pagination
          size="sm"
          page={page}
          startUrl={pathname}
          prevUrl={`${pathname}${page > 1 ? `?p=${page - 1}` : ""}`}
          nextUrl={
            nft.length == pageSize + 1 ? `${pathname}?p=${page + 1}` : undefined
          }
        />
      </HStack>

      {nft.length === 0 ? (
        <NoContent>{t`No assets`}</NoContent>
      ) : (
        <Grid
          gridTemplateColumns={`repeat(auto-fill, minmax(${
            open ? "168px" : "240px"
          }, 1fr))`}
          gridAutoRows="max-content"
          overflowY="auto"
          pb={4}
          px={4}
          gap={4}
        >
          {nft
            .slice(0, pageSize)
            .map(
              (token) =>
                token && (
                  <TokenCard
                    glyph={token.glyph}
                    value={token.txo.value}
                    key={token.txo.id}
                    to={`${context}/token/${token.glyph.ref}${
                      page > 0 ? `?p=${page}` : ""
                    }`}
                    size={open ? "sm" : "md"}
                  />
                )
            )}
        </Grid>
      )}
    </>
  );
}
