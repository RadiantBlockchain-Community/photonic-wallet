import db from "@app/db";
import { useLiveQuery } from "dexie-react-hooks";

/**
 * Get total balance. Will return null when loading.
 */
export default function useBalance(id: string) {
  const balance = useLiveQuery(() => db.balance.get(id), [id], null);
  return balance === null
    ? balance
    : (balance?.confirmed || 0) + (balance?.unconfirmed || 0);
}
