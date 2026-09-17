// Bounded, read-only live smoke: 5 finalized blocks through the real ingestion,
// PostgreSQL SQL, and HTTP app. Uses a temporary in-memory PostgreSQL database.
import { PGlite } from "@electric-sql/pglite";
import { createArcClient, verifyChain } from "@arcledger/arc-config";
import { migrate, saveBlock, PostgresStore } from "@arcledger/database";
import { readFinalizedBlock } from "../apps/indexer/src/ingest.js";
import { createApp } from "../apps/api/src/app.js";
import { writeFile, mkdir } from "node:fs/promises";
const client = createArcClient();
await verifyChain(client);
const head = await client.getBlock({ blockTag: "finalized" });
const db = new PGlite();
await migrate(db);
let receipts = 0;
try {
  for (let n = head.number - 4n; n <= head.number; n++) {
    const block = await readFinalizedBlock(client, n, head.number);
    await db.transaction(async (c) =>
      saveBlock(c, block, head.number.toString()),
    );
    receipts += block.transactions.length;
  }
  const store = new PostgresStore(db),
    app = createApp(store);
  const status = await (await app.request("/v1/status")).json();
  const report = {
    checkedAt: new Date().toISOString(),
    scope:
      "Five recent finalized Mainnet blocks; not a full balance reconciliation",
    receipts,
    status,
  };
  await mkdir(".local", { recursive: true });
  await writeFile(".local/mainnet-smoke.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await db.close();
}
