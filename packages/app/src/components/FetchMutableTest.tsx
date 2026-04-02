import { electrumWorker } from "@app/electrum/Electrum";
import { SmartToken } from "@app/types";
import { DownloadIcon } from "@chakra-ui/icons";
import { GridItem, Button } from "@chakra-ui/react";
import Outpoint from "@lib/Outpoint";
import { decodeGlyph } from "@lib/token";
import { parseMutableScript } from "@lib/script";
import { findTokenOutput } from "@lib/tx";
import { t } from "@lingui/macro";
import { Transaction } from "@radiant-core/radiantjs";

// Testing mutable tokens
// Not used yet

async function fetchTokenData(ref: Outpoint, immutable: boolean) {
  const refResponse = await electrumWorker.value.getRef(ref.toString());

  if (!refResponse.length) {
    return;
  }
  const location = refResponse[immutable ? 0 : refResponse.length - 1].tx_hash;

  const hex = await electrumWorker.value.getTransaction(location);
  const refTx = new Transaction(hex);
  const { vout } = findTokenOutput(
    refTx,
    ref.reverse().toString(),
    immutable ? undefined : parseMutableScript
  );

  if (vout === undefined) {
    return;
  }

  const input = refTx.inputs[vout];

  const decoded = decodeGlyph(input.script);
  console.log(new TextDecoder().decode(decoded?.embeddedFiles.main.b));
}

export default function FetchTokenTest({ token }: { token: SmartToken }) {
  const fetchToken = async () => {
    const nftRef = Outpoint.fromString(token.ref);
    const { txid, vout: refVout } = nftRef.toObject();
    const mutRef = Outpoint.fromUTXO(txid, refVout + 1);

    fetchTokenData(nftRef, true);
    fetchTokenData(mutRef, false);
  };
  return (
    <GridItem
      as={Button}
      onClick={fetchToken}
      leftIcon={<DownloadIcon />}
      colSpan={2}
    >
      {t`Fetch`}
    </GridItem>
  );
}
