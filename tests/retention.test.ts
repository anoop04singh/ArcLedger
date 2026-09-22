import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  migrate,
  commitRawBlock,
  checkpoint,
  projectPending,
  PostgresStore,
  pruneOldestBlocks,
  enforceHistoryBudget,
} from "@arcledger/database";
import { fixture } from "./fixtures.js";
it("prunes complete oldest histories, preserves the checkpoint and parent, and resumes idempotently", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    for (let n = 100; n < 104; n++) await commitRawBlock(db, fixture(n), "103");
    await projectPending(db);
    expect(await pruneOldestBlocks(db)).toBe(1);
    expect(await pruneOldestBlocks(db)).toBe(1);
    expect((await checkpoint(db))?.last_processed_block).toBe("103");
    expect((await new PostgresStore(db).status()).startBlock).toBe("102");
    for (const table of [
      "blocks",
      "transactions",
      "raw_events",
      "address_entries",
    ])
      expect(
        (
          await db.query(
            `SELECT count(*)::int n FROM ${table} WHERE block_number<102`,
          )
        ).rows[0],
      ).toEqual({ n: 0 });
    expect(
      (await db.query("SELECT count(*)::int n FROM transfers")).rows[0],
    ).toEqual({ n: 2 });
    await commitRawBlock(db, fixture(104), "104");
    await commitRawBlock(db, fixture(104), "104");
    await projectPending(db);
    expect((await checkpoint(db))?.last_processed_block).toBe("104");
    expect(
      (await db.query("SELECT count(*)::int n FROM blocks")).rows[0],
    ).toEqual({ n: 3 });
    while (await pruneOldestBlocks(db)) {}
    expect((await db.query("SELECT block_number FROM blocks")).rows).toEqual([
      { block_number: "104" },
    ]);
  } finally {
    await db.close();
  }
}, 30000);
it("reclaims allocated space before deleting and fails closed if the minimum retained block cannot fit", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    await commitRawBlock(db, fixture(), "100");
    let size = 310_000_000,
      compactions = 0;
    const result = await enforceHistoryBudget(db, 16_000_000, {
      measure: async () => size,
      compact: async () => {
        size = 190_000_000;
        compactions++;
      },
    });
    expect(result.prunedBlocks).toBe(0);
    expect(compactions).toBe(1);
    await expect(
      enforceHistoryBudget(db, 16_000_000, {
        measure: async () => 390_000_000,
        compact: async () => {},
      }),
    ).rejects.toThrow("paused");
    expect((await checkpoint(db))?.last_processed_block).toBe("100");
    expect(
      (await db.query("SELECT state FROM retention_state")).rows[0],
    ).toEqual({ state: "blocked" });
    expect(
      (await db.query("SELECT pg_try_advisory_lock(5042,2) acquired")).rows[0],
    ).toEqual({ acquired: true });
  } finally {
    await db.close();
  }
}, 30000);
it("rolls back a pruning error instead of exposing partial histories", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    for (let n = 100; n < 103; n++) await commitRawBlock(db, fixture(n), "102");
    await projectPending(db);
    const broken = {
      query: async (q: string, v?: unknown[]) => {
        if (q.startsWith("DELETE FROM transactions"))
          throw Error("injected storage failure");
        return db.query(q, v);
      },
    };
    await expect(pruneOldestBlocks(broken)).rejects.toThrow("injected");
    expect(
      (await db.query("SELECT count(*)::int n FROM blocks")).rows[0],
    ).toEqual({ n: 3 });
    expect(
      (await db.query("SELECT count(*)::int n FROM raw_events")).rows[0],
    ).toEqual({ n: 9 });
    expect((await new PostgresStore(db).status()).startBlock).toBe("100");
  } finally {
    await db.close();
  }
}, 30000);

it("resumes an interrupted multi-batch pruning plan without skipping the saved cutoff", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    for (let n = 100; n < 320; n++) await commitRawBlock(db, fixture(n), "319");
    let writes = 0;
    const interrupted = {
      query: async (q: string, v?: unknown[]) => {
        if (q.startsWith("DELETE FROM transactions") && ++writes === 2)
          throw Error("interrupted batch");
        return db.query(q, v);
      },
    };
    await expect(pruneOldestBlocks(interrupted, 0.75)).rejects.toThrow(
      "interrupted",
    );
    expect(
      (await db.query("SELECT count(*)::int n FROM blocks")).rows[0],
    ).toEqual({ n: 120 });
    expect(
      (await db.query("SELECT prune_target::text target FROM retention_state"))
        .rows[0],
    ).toEqual({ target: "264" });
    expect(await pruneOldestBlocks(db)).toBe(65);
    expect(
      (await db.query("SELECT count(*)::int n FROM blocks")).rows[0],
    ).toEqual({ n: 55 });
    expect((await checkpoint(db))?.last_processed_block).toBe("319");
    await commitRawBlock(db, fixture(320), "320");
    expect((await new PostgresStore(db).status()).startBlock).toBe("265");
  } finally {
    await db.close();
  }
}, 60000);

it("rolls back raw and projected writes when the measured allocation reaches the safety threshold", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const full = {
      query: async (q: string, v?: unknown[]) =>
        q.includes("pg_database_size")
          ? { rows: [{ bytes: "300000000" }] }
          : db.query(q, v),
    };
    await expect(commitRawBlock(full, fixture(), "100")).rejects.toThrow(
      "rolled back",
    );
    expect(await checkpoint(db)).toBeUndefined();
    expect(
      (await db.query("SELECT count(*)::int n FROM blocks")).rows[0],
    ).toEqual({ n: 0 });
    await commitRawBlock(db, fixture(), "100");
    await expect(projectPending(full)).rejects.toThrow("rolled back");
    expect(
      (await db.query("SELECT count(*)::int n FROM transfers")).rows[0],
    ).toEqual({ n: 0 });
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM transactions WHERE ledger_version=0",
        )
      ).rows[0],
    ).toEqual({ n: 2 });
    expect((await checkpoint(db))?.last_processed_block).toBe("100");
  } finally {
    await db.close();
  }
}, 30000);
