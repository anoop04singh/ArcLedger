import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { migrate, commitRawBlockAtomic, checkpoint } from "@arcledger/database";
import { fixture } from "./fixtures.js";
it("rolls back atomic ingestion when the database size reaches the cleanup threshold", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    // Isolated test database: replace only the size reading, preserving the real write/rollback path.
    await db.exec(
      `CREATE FUNCTION public.pg_database_size(name) RETURNS bigint LANGUAGE sql AS 'SELECT 300000000::bigint'; ALTER FUNCTION public.arcledger_ingest(bigint,numeric,text,text,timestamptz,jsonb,jsonb,jsonb,numeric) SET search_path=public,pg_catalog;`,
    );
    const b = fixture();
    await expect(commitRawBlockAtomic(db, b, b.number)).rejects.toThrow(
      "Storage write rolled back",
    );
    expect(await checkpoint(db)).toBeUndefined();
    expect(
      (await db.query("SELECT count(*)::int n FROM blocks")).rows[0],
    ).toEqual({ n: 0 });
  } finally {
    await db.close();
  }
});
it("commits an atomic server-side block, replays safely and rejects gaps", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const b = fixture();
    expect(await commitRawBlockAtomic(db, b, b.number)).toBe(true);
    expect(await commitRawBlockAtomic(db, b, b.number)).toBe(false);
    expect((await checkpoint(db))?.last_processed_block).toBe(b.number);
    await expect(
      commitRawBlockAtomic(
        db,
        {
          ...b,
          number: "102",
          hash: `0x${"ab".repeat(32)}`,
          transactions: [],
          logs: [],
        },
        "102",
      ),
    ).rejects.toThrow("Non-contiguous");
    expect(
      (await db.query("SELECT count(*)::int n FROM blocks")).rows[0],
    ).toEqual({ n: 1 });
  } finally {
    await db.close();
  }
});
it("rolls back the whole server-side statement on conflicting raw evidence", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const b = fixture();
    b.logs.push({ ...b.logs[0] });
    await expect(commitRawBlockAtomic(db, b, b.number)).rejects.toThrow();
    expect(await checkpoint(db)).toBeUndefined();
    expect(
      (await db.query("SELECT count(*)::int n FROM transactions")).rows[0],
    ).toEqual({ n: 0 });
  } finally {
    await db.close();
  }
});
