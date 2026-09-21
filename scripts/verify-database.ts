import { mkdir, writeFile } from "node:fs/promises";
import { databaseSnapshot } from "@arcledger/database";
import assert from "node:assert/strict";
import {
  createPool,
  databaseHealth,
  checkpoint,
  projectPending,
  PostgresStore,
} from "@arcledger/database";
import { createArcRpc, ARC_MAINNET, readMode } from "@arcledger/arc-config";
import { runIndexer, readIndexerOptions } from "../apps/indexer/src/worker.js";
import { createApp } from "../apps/api/src/app.js";
if (readMode() !== "mainnet")
  throw new Error(
    "Set ARCLEDGER_MODE=mainnet for configured-database verification",
  );
const pool = createPool(),
  rpc = createArcRpc();
pool.on("error", () => console.error("Verification database disconnected."));
try {
  await databaseHealth(pool);
  const phases: string[][] = [];
  for (let phase = 0; phase < 2; phase++) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 90000),
      committed: string[] = [];
    try {
      await runIndexer({
        rpc,
        options: readIndexerOptions(),
        signal: controller.signal,
        connect: async () => {
          const db = await pool.connect();
          const failed = () => {};
          db.on("error", failed);
          return {
            db,
            close: async () => {
              db.removeListener("error", failed);
              db.release(true);
            },
          };
        },
        onProgress: (p) => {
          committed.push(p.block);
          if (committed.length === 2) controller.abort();
        },
        onRetry: () =>
          console.error(
            "Temporary failure; retrying from persisted checkpoint.",
          ),
      });
    } finally {
      clearTimeout(timer);
    }
    assert.equal(
      committed.length,
      2,
      "Expected two committed blocks within 90 seconds",
    );
    assert.equal((await checkpoint(pool))?.last_processed_block, committed[1]);
    phases.push(committed);
  }
  assert.equal(
    BigInt(phases[1][0]),
    BigInt(phases[0][1]) + 1n,
    "Restart must resume at the next durable block",
  );
  const db = await pool.connect();
  let projected = 0;
  try {
    for (let batch = 0; batch < 10; batch++) {
      const result = await projectPending(db, 100);
      assert.equal(result.failed, 0, "Inspect projection errors");
      projected += result.projected;
      if (!result.projected) break;
    }
  } finally {
    db.release();
  }
  const app = createApp(
    new PostgresStore(pool),
    async (address) => {
      const block = await rpc.blockNumber();
      return { block, value: await rpc.balance(address, block) };
    },
    { head: () => rpc.blockNumber() },
  );
  const response = await app.request("/v1/status");
  assert.equal(response.status, 200);
  const status = await response.json();
  assert.equal(status.database, "healthy");
  const snapshot = await databaseSnapshot(pool);
  const report = {
    checkedAt: new Date().toISOString(),
    database: "healthy",
    chainId: ARC_MAINNET.chainId,
    phases,
    restart: "passed",
    projected,
    status,
    ...snapshot,
  };
  await mkdir(".local", { recursive: true });
  await writeFile(
    ".local/part4-database-verification.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch {
  console.error(
    "Configured-database verification failed. Check migrations, connection settings, RPC availability and worker ownership. No checkpoint was reset.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
