import { Script, Transaction } from "@radiantblockchain/radiantjs";
import ElectrumManager from "../ElectrumManager";

export async function isUtxoUnspent(
  electrum: ElectrumManager,
  txid: string,
  vout: number,
  script: string
) {
  const tx = new Transaction();

  // This is a hacky way to check if an output is unspent but there currently isn't a better way
  // Attempt to spend an output with an invalid transaction and check for mempool conflict or missing inputs error
  tx.addInput(
    new Transaction.Input({
      prevTxId: txid,
      outputIndex: vout,
      script: new Script(),
      output: new Transaction.Output({
        script: Script.fromHex(script),
        satoshis: 1,
      }),
    })
  );
  tx.addOutput(
    new Transaction.Output({
      script: Script.fromASM("OP_TRUE"),
      satoshis: 1,
    })
  );
  try {
    await electrum.client?.request(
      "blockchain.transaction.broadcast",
      tx.toString()
    );
  } catch (error) {
    console.debug("Swap load error", error);
    if (error instanceof Error) {
      if (
        error.message.includes("txn-mempool-conflict") ||
        error.message.includes("Missing inputs")
      ) {
        return false;
      }
    }
  }

  return true;
}
