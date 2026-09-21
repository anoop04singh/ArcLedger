import { ARC_MAINNET } from "@arcledger/arc-config";
import type { SqlClient } from "./index.js";
export const HISTORY_CAP_BYTES = 400_000_000,
  HISTORY_TRIGGER_BYTES = 300_000_000,
  HISTORY_TARGET_BYTES = 220_000_000;
const tables = [
  "address_entries",
  "transfers",
  "raw_events",
  "transactions",
  "blocks",
  "validation_runs",
  "indexer_state",
  "retention_state",
] as const;
export class StorageCapacityError extends Error {}
export async function databaseBytes(db: SqlClient) {
  const {
    rows: [r],
  } = await db.query(
    "SELECT pg_database_size(current_database())::text AS bytes",
  );
  const n = Number(r.bytes);
  if (!Number.isSafeInteger(n) || n < 0)
    throw new StorageCapacityError(
      "Database size unavailable; ingestion paused.",
    );
  return n;
}
/** Caller owns the raw writer lock. A durable plan resumes in small whole-block batches. */
export async function pruneOldestBlocks(db: SqlClient, fraction = 0.25) {
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1)
    throw new Error("Invalid pruning fraction");
  const chain = ARC_MAINNET.chainId;
  let removed = 0;
  await db.query("SELECT pg_advisory_lock($1,2)", [chain]);
  try {
    const {
      rows: [prior],
    } = await db.query(
      "SELECT prune_target FROM retention_state WHERE chain_id=$1",
      [chain],
    );
    let target = prior?.prune_target;
    if (target == null) {
      const {
        rows: [cut],
      } = await db.query(
        `SELECT block_number FROM blocks WHERE chain_id=$1 AND block_number<(SELECT last_processed_block FROM indexer_state WHERE chain_id=$1) ORDER BY block_number OFFSET (SELECT GREATEST(0,ceil(count(*)*$2::numeric)::int-1) FROM blocks WHERE chain_id=$1) LIMIT 1`,
        [chain, fraction],
      );
      if (!cut) return 0;
      target = cut.block_number;
      await db.query(
        `INSERT INTO retention_state(chain_id,prune_target,state) VALUES($1,$2,'pruning') ON CONFLICT(chain_id) DO UPDATE SET prune_target=EXCLUDED.prune_target,state='pruning'`,
        [chain, target],
      );
    }
    while (true) {
      await db.query("BEGIN");
      try {
        const {
          rows: [cut],
        } = await db.query(
          `SELECT max(block_number)::text cutoff FROM (SELECT block_number FROM blocks WHERE chain_id=$1 AND block_number<=$2 AND block_number<(SELECT last_processed_block FROM indexer_state WHERE chain_id=$1) ORDER BY block_number LIMIT 100) batch`,
          [chain, target],
        );
        if (cut.cutoff == null) {
          await db.query(
            "UPDATE retention_state SET prune_target=NULL WHERE chain_id=$1",
            [chain],
          );
          await db.query("COMMIT");
          break;
        }
        const args = [chain, cut.cutoff];
        await db.query(
          "DELETE FROM address_entries WHERE chain_id=$1 AND block_number<=$2",
          args,
        );
        await db.query(
          "DELETE FROM transfers WHERE chain_id=$1 AND transaction_hash IN (SELECT tx_hash FROM transactions WHERE chain_id=$1 AND block_number<=$2)",
          args,
        );
        await db.query(
          "DELETE FROM raw_events WHERE chain_id=$1 AND block_number<=$2",
          args,
        );
        await db.query(
          "DELETE FROM transactions WHERE chain_id=$1 AND block_number<=$2",
          args,
        );
        const { rows: deleted } = await db.query(
          "DELETE FROM blocks WHERE chain_id=$1 AND block_number<=$2 RETURNING block_number",
          args,
        );
        await db.query("DELETE FROM validation_runs WHERE start_block<=$1", [
          cut.cutoff,
        ]);
        await db.query(
          `UPDATE indexer_state SET start_block=(SELECT min(block_number) FROM blocks WHERE chain_id=$1),raw_start_block=(SELECT min(block_number) FROM blocks WHERE chain_id=$1 AND raw_complete) WHERE chain_id=$1`,
          [chain],
        );
        await db.query(
          `UPDATE retention_state SET pruned_blocks=pruned_blocks+$2,pruned_through=$3,needs_compaction=true,state='pruning',checked_at=now() WHERE chain_id=$1`,
          [chain, deleted.length, cut.cutoff],
        );
        await db.query("COMMIT");
        removed += deleted.length;
      } catch (e) {
        await db.query("ROLLBACK");
        throw e;
      }
    }
    return removed;
  } finally {
    await db.query("SELECT pg_advisory_unlock($1,2)", [chain]);
  }
}
export async function enforceHistoryBudget(
  db: SqlClient,
  reserveBytes = 16_000_000,
  dependencies: {
    measure?: (db: SqlClient) => Promise<number>;
    compact?: (db: SqlClient) => Promise<void>;
  } = {},
) {
  if (
    !Number.isSafeInteger(reserveBytes) ||
    reserveBytes < 0 ||
    reserveBytes > 80_000_000
  )
    throw new StorageCapacityError(
      "Block exceeds safe storage reservation; checkpoint preserved.",
    );
  const chain = ARC_MAINNET.chainId,
    measure = dependencies.measure ?? databaseBytes;
  const compact = async () => {
    if (dependencies.compact) await dependencies.compact(db);
    else
      for (const table of tables)
        await db.query(`VACUUM (FULL, ANALYZE) public.${table}`);
    await db.query(
      "UPDATE retention_state SET needs_compaction=false WHERE chain_id=$1",
      [chain],
    );
  };
  let bytes = await measure(db),
    deleted = 0;
  const record = async (state: string) =>
    db.query(
      `INSERT INTO retention_state(chain_id,database_bytes,cap_bytes,state) VALUES($1,$2,$3,$4) ON CONFLICT(chain_id) DO UPDATE SET database_bytes=EXCLUDED.database_bytes,cap_bytes=EXCLUDED.cap_bytes,state=EXCLUDED.state,checked_at=now()`,
      [chain, bytes, HISTORY_CAP_BYTES, state],
    );
  const {
    rows: [previous],
  } = await db.query(
    "SELECT needs_compaction,prune_target FROM retention_state WHERE chain_id=$1",
    [chain],
  );
  if (
    bytes + reserveBytes >= HISTORY_TRIGGER_BYTES ||
    previous?.needs_compaction ||
    previous?.prune_target != null
  ) {
    await db.query("SELECT pg_advisory_lock($1,2)", [chain]);
    try {
      await record("pruning");
      if (previous?.prune_target != null)
        deleted += await pruneOldestBlocks(db);
      else if (bytes >= HISTORY_CAP_BYTES && !previous?.needs_compaction)
        deleted += await pruneOldestBlocks(
          db,
          Math.min(
            0.95,
            Math.max(0.25, 1 - (HISTORY_TARGET_BYTES - reserveBytes) / bytes),
          ),
        );
      await compact();
      bytes = await measure(db);
      for (
        let round = 0;
        bytes + reserveBytes > HISTORY_TARGET_BYTES && round < 40;
        round++
      ) {
        const n = await pruneOldestBlocks(db);
        if (!n) break;
        deleted += n;
        await compact();
        bytes = await measure(db);
      }
      if (bytes + reserveBytes >= HISTORY_TRIGGER_BYTES)
        throw new StorageCapacityError(
          "Storage cannot be reclaimed safely; ingestion paused with checkpoint intact.",
        );
    } catch (e) {
      await record("blocked").catch(() => {});
      throw e;
    } finally {
      await db.query("SELECT pg_advisory_unlock($1,2)", [chain]);
    }
  }
  await record("ready");
  return {
    databaseBytes: bytes,
    prunedBlocks: deleted,
    capBytes: HISTORY_CAP_BYTES,
  };
}
