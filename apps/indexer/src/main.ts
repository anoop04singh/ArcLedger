import { setTimeout as delay } from "node:timers/promises";
import {
  ARC_MAINNET,
  createArcClient,
  readMode,
  verifyChain,
} from "@arcledger/arc-config";
import { createPool, saveBlock } from "@arcledger/database";
import { readFinalizedBlock } from "./ingest.js";
if (readMode() !== "mainnet")
  throw new Error(
    "Indexer requires ARCLEDGER_MODE=mainnet. Demo runs without an indexer.",
  );
const start = process.env.INDEXER_START_BLOCK ?? "0";
if (!/^\d+$/.test(start))
  throw new Error("INDEXER_START_BLOCK must be non-negative");
const poll = Number(process.env.INDEXER_POLL_MS ?? 2000);
if (!Number.isSafeInteger(poll) || poll < 250)
  throw new Error("INDEXER_POLL_MS must be at least 250");
const client = createArcClient();
await verifyChain(client);
const pool = createPool(),
  db = await pool.connect();
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    stopping = true;
  });
try {
  const {
    rows: [lock],
  } = await db.query("SELECT pg_try_advisory_lock($1,1) AS acquired", [
    ARC_MAINNET.chainId,
  ]);
  if (!lock.acquired)
    throw new Error("Another ArcLedger indexer owns this database");
  while (!stopping) {
    const {
      rows: [state],
    } = await db.query("SELECT latest_block FROM indexer_state WHERE id=1");
    const next = state ? BigInt(state.latest_block) + 1n : BigInt(start);
    const head = await client.getBlock({ blockTag: "finalized" });
    if (next > head.number) {
      await db.query(
        "UPDATE indexer_state SET finalized_head=$1,updated_at=now() WHERE id=1",
        [head.number.toString()],
      );
      await delay(poll);
      continue;
    }
    const block = await readFinalizedBlock(client, next, head.number);
    await db.query("BEGIN");
    try {
      await saveBlock(db, block, head.number.toString());
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
    console.log(
      `Indexed finalized block ${next} (${block.transactions.length} receipts)`,
    );
  }
} finally {
  db.release();
  await pool.end();
}
