import { ftScriptHash, nftScriptHash, p2pkhScriptHash } from "@lib/script";
import ElectrumManager from "../ElectrumManager";
import { ElectrumUtxo } from "@lib/types";
import { ContractType } from "@app/types";

export async function findSwaps(
  electrum: ElectrumManager,
  address: string
) {
  const utxos = (
    await Promise.all(
      [
        [p2pkhScriptHash(address), ContractType.RXD],
        [ftScriptHash(address), ContractType.FT],
        [nftScriptHash(address), ContractType.NFT],
      ].map(async ([scriptHash, contractType]) =>
        (
          (await electrum.client?.request(
            "blockchain.scripthash.listunspent",
            scriptHash
          )) as ElectrumUtxo[]
        ).map((utxo) => ({ contractType, utxo }))
      )
    )
  ).flat();
  return utxos;
}
