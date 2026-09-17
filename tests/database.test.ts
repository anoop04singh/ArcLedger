import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { migrate, saveBlock, PostgresStore } from "@arcledger/database";
import {
  demoTransactions,
  DEMO_ADDRESS,
} from "../packages/database/src/demo.js";
it("persists PostgreSQL evidence and checkpoints atomically, rejects forks and supports replay", async () => {
  const db = new PGlite();
  await migrate(db);
  await migrate(db);
  const store = new PostgresStore(db);
  expect((await store.status()).state).toBe("idle");
  const tx = demoTransactions()[0];
  const block = {
    number: tx.blockNumber,
    hash: tx.blockHash,
    parentHash: `0x${"00".repeat(32)}` as const,
    timestamp: tx.timestamp,
    transactions: [tx],
  };
  await db.transaction(async (connection) => {
    await saveBlock(connection, block, block.number);
  });
  await db.transaction(async (connection) => {
    await saveBlock(connection, block, block.number);
  });
  expect((await store.status()).canonicalTransfers).toBe(1);
  expect((await store.status()).duplicatesRemoved).toBe(1);
  expect((await store.transaction(tx.hash))?.evidence).toHaveLength(2);
  const ledger = await store.address(DEMO_ADDRESS, 20, 0);
  expect(ledger.sent).toBe("10000000000000000000");
  expect(ledger.feesPaid).toBe(tx.fee);
  expect(ledger.transactionCount).toBe(1);
  await expect(
    db.transaction(async (c) =>
      saveBlock(c, { ...block, hash: `0x${"ff".repeat(32)}` }, block.number),
    ),
  ).rejects.toThrow(/conflict/);
  await expect(
    db.transaction(async (c) =>
      saveBlock(
        c,
        { ...block, number: String(BigInt(block.number) + 2n) },
        block.number,
      ),
    ),
  ).rejects.toThrow(/Non-contiguous/);
  const next = {
    ...block,
    number: String(BigInt(block.number) + 1n),
    hash: `0x${"ee".repeat(32)}` as const,
    parentHash: block.hash,
  };
  await expect(
    db.transaction(async (c) => saveBlock(c, next, next.number)),
  ).rejects.toThrow(/Receipt block mismatch/);
  expect((await store.status()).latestIndexedBlock).toBe(block.number);
  const rows = await db.query("SELECT count(*)::int AS n FROM blocks");
  expect(rows.rows[0]).toEqual({ n: 1 });
  await db.close();
}, 30000);
