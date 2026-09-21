import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createPool, checkpoint, commitRawBlock } from "@arcledger/database";
import { createArcRpc } from "@arcledger/arc-config";
import { readRawBlock } from "../apps/indexer/src/ingest.js";
import { readValidationSnapshot } from "./lib/validation.js";
const pool = createPool();
try {
  const db = await pool.connect();
  try {
    const {
      rows: [lock],
    } = await db.query("SELECT pg_try_advisory_lock(5042,1) acquired");
    assert(
      lock.acquired,
      "Stop the indexer before configured-database replay verification",
    );
    const state = await checkpoint(db);
    assert(state, "Index at least one complete block first");
    const n = state.last_processed_block;
    const raw = await readRawBlock(createArcRpc(), BigInt(n), 32);
    const before = await readValidationSnapshot(db, n, n);
    assert(
      before.transactions.every((t) => t.ledger_version === 1),
      "Finish ledger projection before verification",
    );
    assert.equal(await commitRawBlock(db, raw, state.observed_head), false);
    assert.equal(await commitRawBlock(db, raw, state.observed_head), false);
    const after = await readValidationSnapshot(db, n, n);
    assert.deepEqual(
      after,
      before,
      "Replay changed stored raw or canonical records",
    );
    assert.deepEqual(
      await checkpoint(db),
      state,
      "Replay changed the checkpoint",
    );
    const report = {
      checkedAt: new Date().toISOString(),
      block: n,
      replays: 2,
      status: "passed",
      unchangedTables: [
        "blocks",
        "transactions",
        "raw_events",
        "transfers",
        "address_entries",
        "indexer_state",
      ],
    };
    await mkdir(".local", { recursive: true });
    await writeFile(
      ".local/part5-replay.json",
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await db.query("SELECT pg_advisory_unlock(5042,1)").catch(() => {});
    db.release(true);
  }
} catch {
  console.error(
    "Replay verification failed. Check worker ownership, raw coverage and completed projections. No checkpoint was reset.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
