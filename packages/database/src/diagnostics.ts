import type { SqlClient } from "./index.js";
import { ARC_MAINNET } from "@arcledger/arc-config";
/** Safe diagnostics for the configured-database verification command; no connection details. */
export async function databaseSnapshot(db: SqlClient) {
  const {
    rows: [counts],
  } = await db.query(`SELECT
    (SELECT count(*)::int FROM blocks) blocks,
    (SELECT count(*)::int FROM transactions) transactions,
    (SELECT count(*)::int FROM raw_events) raw_events,
    (SELECT count(*)::int FROM transfers) transfers,
    (SELECT count(*)::int FROM address_entries) address_entries,
    (SELECT count(*)::int FROM indexer_state) indexer_state,
    (SELECT count(*)::int FROM webhooks) webhooks,
    (SELECT count(*)::int FROM webhook_deliveries) webhook_deliveries`);
  const {
    rows: [sample],
  } = await db.query(
    "SELECT tx_hash,from_address FROM transactions WHERE chain_id=$1 AND explanation IS NOT NULL AND jsonb_array_length(explanation->'movements')>0 ORDER BY block_number DESC,tx_hash LIMIT 1",
    [ARC_MAINNET.chainId],
  );
  return { counts, sample: sample ?? null };
}
