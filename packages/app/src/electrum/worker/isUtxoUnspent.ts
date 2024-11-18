import ElectrumManager from "../ElectrumManager";
import { ElectrumUtxo } from "@lib/types";

export async function isUtxoUnspent(
  electrum: ElectrumManager,
  txid: string,
  vout: number,
  scriptHash: string
) {
  const utxos = (await electrum.client?.request(
    "blockchain.scripthash.listunspent",
    scriptHash
  )) as ElectrumUtxo[];
  return utxos.some((utxo) => utxo.tx_hash === txid && utxo.tx_pos == vout);
}
