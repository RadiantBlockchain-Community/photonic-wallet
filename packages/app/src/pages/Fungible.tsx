import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { t } from "@lingui/macro";
import {
  Box,
  Button,
  ButtonGroup,
  Flex,
  Icon,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
} from "@chakra-ui/react";
import PageHeader from "@app/components/PageHeader";
import { SmartTokenType } from "@app/types";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@app/db";
import TokenRow from "@app/components/TokenRow";
import ViewPanelLayout from "@app/layouts/ViewPanelLayout";
import { RiQuestionFill } from "react-icons/ri";
import ViewFungible from "@app/components/ViewFungible";
import NoContent from "@app/components/NoContent";
import MintMenu from "@app/components/MintMenu";
import { Search2Icon } from "@chakra-ui/icons";
import { BsList, BsListUl } from "react-icons/bs";

export default function Fungible() {
  const { sref } = useParams();

  return (
    <ViewPanelLayout>
      <TokenGrid />
      {sref && <ViewFungible sref={sref} context="/fungible" />}
    </ViewPanelLayout>
  );
}

function TokenGrid() {
  const [query, setQuery] = useState("");
  const [includePending, setIncludePending] = useState(true);
  const [mediaOnly, setMediaOnly] = useState(false);
  const [tickerOnly, setTickerOnly] = useState(false);
  const [sortBy, setSortBy] = useState("balance_desc");
  const [viewMode, setViewMode] = useState<"compact" | "comfortable">("compact");

  const [tokens, balances] = useLiveQuery(
    async () => {
      // Get all FTs
      const tokens = await db.glyph
        .where({ tokenType: SmartTokenType.FT })
        .toArray();

      // Get FT balances by ref
      const refs = tokens.map(({ ref }) => ref);
      const balances = Object.fromEntries(
        (await db.balance.where("id").anyOf(refs).toArray()).map((b) => [
          b.id,
          b,
        ])
      );
      return [tokens, balances];
    },
    [],
    [null, null]
  );

  const listed = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const rows = (tokens || [])
      .map((token) => {
        const confirmed = balances?.[token.ref]?.confirmed || 0;
        const unconfirmed = balances?.[token.ref]?.unconfirmed || 0;
        const value = includePending ? confirmed + unconfirmed : confirmed;
        return {
          token,
          value,
          confirmed,
          unconfirmed,
        };
      })
      .filter(({ token, value }) => {
        if (value <= 0) {
          return false;
        }
        if (mediaOnly && !token.embed && !token.remote) {
          return false;
        }
        if (tickerOnly && !(token.ticker as string)) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }
        return [token.name, token.ticker, token.ref, token.type]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      });

    rows.sort((a, b) => {
      switch (sortBy) {
        case "balance_asc":
          return a.value - b.value;
        case "name_asc":
          return (a.token.name || "").localeCompare(b.token.name || "");
        case "name_desc":
          return (b.token.name || "").localeCompare(a.token.name || "");
        case "newest":
          return (b.token.height || 0) - (a.token.height || 0);
        case "oldest":
          return (a.token.height || 0) - (b.token.height || 0);
        case "balance_desc":
        default:
          return b.value - a.value;
      }
    });

    return rows;
  }, [balances, includePending, mediaOnly, query, sortBy, tickerOnly, tokens]);

  if (!tokens) {
    return null;
  }

  return (
    <>
      <PageHeader toolbar={<MintMenu />}>{t`Fungible Tokens`}</PageHeader>

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
            placeholder="Search FTs"
          />
        </InputGroup>

        <Button
          size="sm"
          variant={includePending ? "solid" : "outline"}
          onClick={() => setIncludePending((v) => !v)}
        >
          Pending
        </Button>

        <Button
          size="sm"
          variant={mediaOnly ? "solid" : "outline"}
          onClick={() => setMediaOnly((v) => !v)}
        >
          Media
        </Button>

        <Button
          size="sm"
          variant={tickerOnly ? "solid" : "outline"}
          onClick={() => setTickerOnly((v) => !v)}
        >
          Ticker
        </Button>

        <Select
          size="sm"
          aria-label="Sort fungible tokens"
          title="Sort fungible tokens"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          maxW={{ base: "190px", md: "260px" }}
        >
          <option value="balance_desc">Balance high-low</option>
          <option value="balance_asc">Balance low-high</option>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="name_asc">Name A-Z</option>
          <option value="name_desc">Name Z-A</option>
        </Select>

        <ButtonGroup size="sm" isAttached variant="outline">
          <Button
            aria-label="Compact rows"
            variant={viewMode === "compact" ? "solid" : "outline"}
            onClick={() => setViewMode("compact")}
          >
            <Icon as={BsList} />
          </Button>
          <Button
            aria-label="Comfortable rows"
            variant={viewMode === "comfortable" ? "solid" : "outline"}
            onClick={() => setViewMode("comfortable")}
          >
            <Icon as={BsListUl} />
          </Button>
        </ButtonGroup>
      </Flex>

      <Box
        px={2}
        overflowY="auto"
        sx={{ scrollbarGutter: "stable both-edges" }}
      >
        {listed.length === 0 ? (
          <NoContent>{t`No assets`}</NoContent>
        ) : (
          listed.map(({ token, value }) =>
            value > 0 && (
                <TokenRow
                  glyph={token}
                  value={value}
                  key={token.ref}
                  to={`/fungible/token/${token.ref}`}
                  size={viewMode === "compact" ? "sm" : "md"}
                  defaultIcon={RiQuestionFill}
                />
              )
          )
        )}
      </Box>
    </>
  );
}
