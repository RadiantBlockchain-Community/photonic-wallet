import { SelectableInput } from "@lib/coinSelect";
import db from "./db";
import { UnfinalizedInput } from "@lib/types";
import { ContractType, TxO } from "./types";
import { parseFtScript } from "@lib/script";
import { reverseRef } from "@lib/Outpoint";

// Update txo table after a transaction. This will keep the db in sync before an ElectrumX subscription is received.
// ownScript and changeScript will be the same for RXD UTXOs
export async function updateWalletUtxos(
  contractType: ContractType,
  ownScript: string,
  changeScript: string,
  txid: string,
  inputs: SelectableInput[],
  outputs: UnfinalizedInput[]
) {
  const newTxos: TxO[] = [];
  await db.transaction("rw", db.txo, async () => {
    // Spend inputs
    await Promise.all(
      inputs.map(async (input) => {
        const { utxo } = input;
        // FIXME this is a bit messy
        const { id } = (utxo as TxO) || input;
        if (id) {
          await db.txo.update(id, {
            spent: 1,
          });
        }
      })
    );
    // Add outputs
    for (const [vout, output] of outputs.entries()) {
      // Check for FT change, FT sent to self or RXD funding change
      const sentToSelf = output.script === ownScript;
      if (sentToSelf || output.script === changeScript) {
        const outputContractType = sentToSelf ? contractType : ContractType.RXD;
        const txo: TxO = {
          contractType: outputContractType,
          script: output.script,
          spent: 0,
          height: Infinity,
          txid,
          vout,
          value: output.value,
          change: 1,
          date: new Date().getTime(),
        };
        const id = (await db.txo.put(txo)) as number;
        newTxos.push({ ...txo, id });
      }
    }
  });
  return newTxos;
}

// Update RXD balances
export async function updateRxdBalances(id: string) {
  await db.transaction("rw", db.txo, db.balance, async () => {
    let confirmed = 0;
    let unconfirmed = 0;
    await db.txo
      .where({ contractType: ContractType.RXD, spent: 0 })
      .each(({ height, value }) => {
        if (height === Infinity) {
          unconfirmed += value;
        } else {
          confirmed += value;
        }
      });

    await db.balance.put({ id, confirmed, unconfirmed });
  });
}

// Update FT balances
export async function updateFtBalances(scripts: Set<string>) {
  await db.transaction("rw", db.txo, db.balance, async () => {
    for (const script of scripts) {
      let confirmed = 0;
      let unconfirmed = 0;
      await db.txo.where({ script, spent: 0 }).each(({ height, value }) => {
        if (height === Infinity) {
          unconfirmed += value;
        } else {
          confirmed += value;
        }
      });
      const { ref } = parseFtScript(script);
      await db.balance.put({
        id: reverseRef(ref as string),
        confirmed,
        unconfirmed,
      });
    }
  });
}
