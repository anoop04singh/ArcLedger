import { setTimeout as delay } from "node:timers/promises";
import {
  ARC_MAINNET,
  createArcRpc,
  readMode,
  RpcUnavailableError,
} from "@arcledger/arc-config";
import {
  createPool,
  enforceHistoryBudget,
  StorageCapacityError,
} from "@arcledger/database";
import { readIndexerOptions, runIndexer } from "./worker.js";
if (readMode() !== "mainnet")
  throw new Error("Indexer requires ARCLEDGER_MODE=mainnet");
const options = readIndexerOptions();
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => controller.abort());
while (process.env.WORKER_PAUSED === "true" && !controller.signal.aborted) {
  console.log("Indexer paused for storage maintenance.");
  await delay(30000, undefined, { signal: controller.signal }).catch(() => {});
}
const pool = createPool();
pool.on("error", () =>
  console.error("Database connection lost; indexer will reconnect."),
);
try {
  await runIndexer({
    rpc: createArcRpc(),
    options,
    signal: controller.signal,
    connect: async () => {
      const db = await pool.connect();
      let broken = false;
      const failed = () => {
        broken = true;
      };
      db.on("error", failed);
      return {
        db,
        close: async () => {
          try {
            if (!broken)
              await db.query("SELECT pg_advisory_unlock($1,1)", [
                ARC_MAINNET.chainId,
              ]);
          } finally {
            db.removeListener("error", failed);
            db.release(true);
          }
        },
      };
    },
    beforeBlock: async (db, block) => {
      const reserve = Math.max(
        16_000_000,
        Buffer.byteLength(JSON.stringify(block)) * 12,
      );
      const result = await enforceHistoryBudget(db, reserve);
      if (result.prunedBlocks)
        console.log(JSON.stringify({ event: "history_pruned", ...result }));
    },
    onProgress: (progress) =>
      console.log(JSON.stringify({ event: "block_committed", ...progress })),
    onRetry: (error) =>
      console.error(
        JSON.stringify({
          event: "indexer_retry",
          reason:
            error instanceof RpcUnavailableError ||
            error instanceof StorageCapacityError
              ? error.message
              : "Database or RPC snapshot unavailable; retrying from durable checkpoint.",
        }),
      ),
  });
} finally {
  await pool.end();
}
