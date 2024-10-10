import db from "@app/db";
import { ContractType } from "@app/types";

const MAX_UTXOS = 10;

// Check if UTXO consolidation is required
export async function consolidationCheck() {
  // Wait for all contracts to finish syncing
  const syncingCount = await db.subscriptionStatus
    .filter((v) => !v.sync.done)
    .count();
  if (syncingCount > 0) {
    return;
  }

  let consolidationRequired = false;

  // Check RXD
  const count = await db.txo
    .where({ contractType: ContractType.RXD, spent: 0 })
    .count();

  if (count > MAX_UTXOS) {
    consolidationRequired = true;
  } else {
    // Check each FT
    (
      await db.txo
        .where({
          contractType: ContractType.FT,
          spent: 0,
        })
        .toArray()
    ).reduce((acc, cur) => {
      if (!acc[cur.script]) {
        acc[cur.script] = 0;
      }
      acc[cur.script] += 1;
      if (acc[cur.script] > MAX_UTXOS) {
        consolidationRequired = true;
      }
      return acc;
    }, {} as { [key: string]: number });
  }

  db.kvp.put(consolidationRequired, "consolidationRequired");
}
