import { useEffect, useMemo, useState } from "react";
import { Transaction } from "@radiantblockchain/radiantjs";
import opfs from "@app/opfs";
import Outpoint from "@lib/Outpoint";
import { Box, SimpleGrid } from "@chakra-ui/react";
import { DecodedGlyph, decodeGlyph } from "@lib/token";
import { jsonHex } from "@lib/util";
import DownloadLink from "./DownloadLink";
import { PropertyCard } from "./ViewDigitalObject";
import { t } from "@lingui/macro";
import { SmartToken } from "@app/types";
import { DownloadIcon } from "@chakra-ui/icons";
import ActionIcon from "./ActionIcon";
import mime from "mime";

export default function TokenData({ glyph }: { glyph: SmartToken }) {
  const reveal = useMemo(
    () => glyph.revealOutpoint && Outpoint.fromString(glyph.revealOutpoint),
    [glyph.id]
  );
  const [{ tx, decoded }, setData] = useState<{
    tx?: string;
    decoded?: DecodedGlyph;
  }>({
    tx: undefined,
    decoded: undefined,
  });

  useEffect(() => {
    (async () => {
      if (reveal) {
        const txid = reveal.getTxid();
        const tx = await opfs.getTx(txid);

        const script = tx
          ? new Transaction(tx).inputs[reveal.getVout()].script
          : undefined;
        const decoded = (script && decodeGlyph(script)) || undefined;

        setData({ tx, decoded });
      }
    })();
  }, [reveal]);

  return !reveal || !decoded || !tx ? (
    <Box mx={4}>{t`Data not found`}</Box>
  ) : (
    <>
      <PropertyCard heading="Token Data" mb={4}>
        <Box
          as="pre"
          gridArea="child"
          p={4}
          whiteSpace="pre-wrap"
          wordBreak="break-all"
          bg="blackAlpha.300"
        >
          {jsonHex(
            {
              ...decoded.payload,
              ...decoded.embeddedFiles,
              ...decoded.remoteFiles,
            },
            36
          )}
        </Box>
      </PropertyCard>
      <SimpleGrid columns={{ base: 1, lg: 2 }} gap={2}>
        {tx && (
          <DownloadLink
            leftIcon={<ActionIcon as={DownloadIcon} />}
            data={new TextEncoder().encode(tx)}
            mimeType="application/octet-stream"
            filename={`${reveal.getTxid()}.txt`}
          >
            {t`Download transaction`}
          </DownloadLink>
        )}
        {glyph.embed && (
          <DownloadLink
            leftIcon={<ActionIcon as={DownloadIcon} />}
            mimeType="application/octet-stream"
            data={glyph.embed.b}
            filename={`main.${mime.getExtension(glyph.embed.t) || "dat"}`}
          >
            {t`Download main file`}
          </DownloadLink>
        )}
      </SimpleGrid>
    </>
  );
}
