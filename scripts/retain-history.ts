import { createPool, enforceHistoryBudget } from "@arcledger/database";
import { readMode } from "@arcledger/arc-config";
if (readMode() !== "mainnet")
  throw new Error("Retention requires ARCLEDGER_MODE=mainnet");
const pool = createPool();
pool.on("error", () => console.error("Retention connection lost."));
const db = await pool.connect();
db.on("error", () =>
  console.error("Retention session lost; retry the saved pruning plan."),
);
try {
  const {
    rows: [lock],
  } = await db.query("SELECT pg_try_advisory_lock(5042,1) acquired");
  if (!lock.acquired)
    throw new Error("Pause the indexer before manual retention.");
  console.log(JSON.stringify(await enforceHistoryBudget(db)));
} finally {
  await db.query("SELECT pg_advisory_unlock(5042,1)").catch(() => {});
  db.release(true);
  await pool.end();
}
