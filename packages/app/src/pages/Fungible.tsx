import { useParams } from "react-router-dom";
import { t } from "@lingui/macro";
import { Box } from "@chakra-ui/react";
import PageHeader from "@app/components/PageHeader";
import { SmartToken, SmartTokenType } from "@app/types";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@app/db";
import TokenRow from "@app/components/TokenRow";
import ViewPanelLayout from "@app/layouts/ViewPanelLayout";
import { RiQuestionFill } from "react-icons/ri";
import ViewFungible from "@app/components/ViewFungible";
import NoContent from "@app/components/NoContent";
import MintMenu from "@app/components/MintMenu";

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

  const hasBalance = (glyph: SmartToken) =>
    glyph &&
    balances &&
    (balances[glyph.ref]?.confirmed ||
      0 + balances[glyph.ref]?.unconfirmed ||
      0);

  if (!tokens) {
    return null;
  }

  const withBalance = tokens.filter((t) => hasBalance(t));

  return (
    <>
      <PageHeader toolbar={<MintMenu />}>{t`Fungible Tokens`}</PageHeader>
      <Box px={2} overflowY="auto" sx={{ scrollbarGutter: "stable both-edges" }}>
        {withBalance.length === 0 ? (
          <NoContent>{t`No assets`}</NoContent>
        ) : (
          tokens.map((token) => (
            <TokenRow
              glyph={token}
              value={
                (balances[token.ref]?.confirmed || 0) +
                (balances[token.ref]?.unconfirmed || 0)
              }
              key={token.ref}
              to={`/fungible/token/${token.ref}`}
              size="sm"
              defaultIcon={RiQuestionFill}
            />
          ))
        )}
      </Box>
    </>
  );
}
