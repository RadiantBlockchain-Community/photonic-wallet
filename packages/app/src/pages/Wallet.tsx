import { useMemo, useState } from "react";
import {
  Button,
  ButtonGroup,
  Flex,
  Grid,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  Menu,
  MenuButton,
  MenuItemOption,
  MenuList,
  MenuOptionGroup,
  Select,
  Spacer,
  VStack,
} from "@chakra-ui/react";
import { Link, useLocation, useParams } from "react-router-dom";
import { t } from "@lingui/macro";
import NoContent from "@app/components/NoContent";
import useRestoreScroll from "@app/hooks/useRestoreScroll";
import TokenCard from "@app/components/TokenCard";
import Pagination from "@app/components/Pagination";
import PageHeader from "@app/components/PageHeader";
import ViewPanelLayout from "@app/layouts/ViewPanelLayout";
import useQueryString from "@app/hooks/useQueryString";
import ViewDigitalObject from "@app/components/ViewDigitalObject";
import {
  ChevronDownIcon,
  Search2Icon,
  SmallCloseIcon,
} from "@chakra-ui/icons";
import MintMenu from "@app/components/MintMenu";
import ActionIcon from "@app/components/ActionIcon";
import { MdFilterAlt } from "react-icons/md";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@app/db";
import { SmartTokenType, TxO } from "@app/types";
import { TbBox } from "react-icons/tb";
import { BsGrid3X3Gap, BsListUl } from "react-icons/bs";
import TokenRow from "@app/components/TokenRow";

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
  const [query, setQuery] = useState("");
  const { pathname } = useLocation();
  const { p: pageParam } = useQueryString();
  const { containerRef } = useParams();
  const page = parseInt(pageParam || "0", 10);
  const [filterType, setFilterType] = useState<string[]>(allTypes);
  const [mediaOnly, setMediaOnly] = useState(false);
  const [freshOnly, setFreshOnly] = useState(false);
  const [sortBy, setSortBy] = useState("newest");
  const [viewMode, setViewMode] = useState<"grid" | "compact" | "list">(
    open ? "compact" : "grid"
  );

  const nft = useLiveQuery(
    async () => {
      const tokens = await db.glyph
        .where("tokenType")
        .equals(SmartTokenType.NFT)
        .filter(
          (glyph) =>
            glyph.spent === 0 &&
            !!glyph.lastTxoId &&
            (containerRef ? glyph.container === containerRef : true)
        )
        .toArray();

      return Promise.all(
        tokens.map(async (glyph) => ({
          glyph,
          txo: (await db.txo.get({ id: glyph.lastTxoId })) as TxO,
        }))
      );
    },
    [containerRef],
    []
  );
  const context = containerRef ? `/container/${containerRef}` : "/objects";

  const container = useLiveQuery(() => {
    if (containerRef) {
      return db.glyph.get({ ref: containerRef });
    }
    return undefined;
  }, [containerRef]);

  useRestoreScroll();

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const items = [...nft].filter(({ glyph, txo }) => {
      if (!txo) {
        return false;
      }

      if (filterType.length && !filterType.includes(glyph.type)) {
        return false;
      }

      if (mediaOnly && !glyph.embed && !glyph.remote) {
        return false;
      }

      if (freshOnly && !glyph.fresh) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [glyph.name, glyph.ticker, glyph.ref]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    items.sort((a, b) => {
      switch (sortBy) {
        case "oldest":
          return (a.glyph.height || 0) - (b.glyph.height || 0);
        case "name_asc":
          return (a.glyph.name || "").localeCompare(b.glyph.name || "");
        case "name_desc":
          return (b.glyph.name || "").localeCompare(a.glyph.name || "");
        case "newest":
        default:
          return (b.glyph.height || 0) - (a.glyph.height || 0);
      }
    });

    return items;
  }, [filterType, freshOnly, mediaOnly, nft, query, sortBy]);

  const paged = filtered.slice(page * pageSize, page * pageSize + pageSize + 1);
  const visible = paged.slice(0, pageSize);

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

      <Flex
        columnGap={2}
        rowGap={2}
        mb={2}
        mx={{ base: 2, md: 4 }}
        wrap="wrap"
        alignItems="center"
      >
        <InputGroup size="sm" maxW={{ base: "full", md: "320px" }}>
          <InputLeftElement pointerEvents="none">
            <Search2Icon color="gray.400" />
          </InputLeftElement>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search NFTs"
          />
        </InputGroup>

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
          <MenuList minWidth="260px">
            <MenuOptionGroup
              title={t`Type`}
              type="checkbox"
              value={filterType}
              onChange={(types) => setFilterType(types as string[])}
            >
              <MenuItemOption value="object">{t`Object`}</MenuItemOption>
              <MenuItemOption value="container">{t`Container`}</MenuItemOption>
              <MenuItemOption value="user">{t`User`}</MenuItemOption>
            </MenuOptionGroup>
          </MenuList>
        </Menu>

        <Button
          size="sm"
          variant={mediaOnly ? "solid" : "outline"}
          onClick={() => setMediaOnly((v) => !v)}
        >
          Media
        </Button>

        <Button
          size="sm"
          variant={freshOnly ? "solid" : "outline"}
          onClick={() => setFreshOnly((v) => !v)}
        >
          New
        </Button>

        <Select
          size="sm"
          aria-label="Sort NFTs"
          title="Sort NFTs"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          maxW={{ base: "180px", md: "220px" }}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name_asc">Name A-Z</option>
          <option value="name_desc">Name Z-A</option>
        </Select>

        <ButtonGroup size="sm" isAttached variant="outline">
          <Button
            aria-label="Grid view"
            variant={viewMode === "grid" ? "solid" : "outline"}
            onClick={() => setViewMode("grid")}
          >
            <Icon as={BsGrid3X3Gap} />
          </Button>
          <Button
            aria-label="Compact grid view"
            variant={viewMode === "compact" ? "solid" : "outline"}
            onClick={() => setViewMode("compact")}
          >
            <Icon as={TbBox} />
          </Button>
          <Button
            aria-label="List view"
            variant={viewMode === "list" ? "solid" : "outline"}
            onClick={() => setViewMode("list")}
          >
            <Icon as={BsListUl} />
          </Button>
        </ButtonGroup>

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

        <Spacer display={{ base: "none", xl: "block" }} />

        <Pagination
          size="sm"
          page={page}
          startUrl={pathname}
          prevUrl={`${pathname}${page > 0 ? `?p=${page - 1}` : ""}`}
          nextUrl={paged.length === pageSize + 1 ? `${pathname}?p=${page + 1}` : undefined}
        />
      </Flex>

      {visible.length === 0 ? (
        <NoContent>{t`No assets`}</NoContent>
      ) : viewMode === "list" ? (
        <VStack
          align="stretch"
          overflowY="auto"
          sx={{ scrollbarGutter: "stable both-edges" }}
          pb={4}
          px={3}
          spacing={1}
        >
          {visible.map(
            (token) =>
              token.txo && (
                <TokenRow
                  glyph={token.glyph}
                  value={token.txo.value}
                  key={token.txo.id}
                  to={`${context}/token/${token.glyph.ref}${
                    page > 0 ? `?p=${page}` : ""
                  }`}
                  size="md"
                />
              )
          )}
        </VStack>
      ) : (
        <Grid
          gridTemplateColumns={`repeat(auto-fill, minmax(${ 
            viewMode === "compact" || open ? "168px" : "240px"
          }, 1fr))`}
          gridAutoRows="max-content"
          overflowY="auto"
          sx={{ scrollbarGutter: "stable both-edges" }}
          pb={4}
          px={2}
          gap={4}
        >
          {visible.map(
            (token) =>
              token.txo && (
                <TokenCard
                  glyph={token.glyph}
                  value={token.txo.value}
                  key={token.txo.id}
                  to={`${context}/token/${token.glyph.ref}${
                    page > 0 ? `?p=${page}` : ""
                  }`}
                  size={viewMode === "compact" || open ? "sm" : "md"}
                />
              )
          )}
        </Grid>
      )}
    </>
  );
}
