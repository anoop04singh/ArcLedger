import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  databaseOptions,
  databaseHealth,
  migrate,
  PostgresStore,
} from "@arcledger/database";
import { createApp } from "../apps/api/src/app.js";
it("uses verified TLS for remote hosts and refuses transaction pooling", () => {
  const options = databaseOptions({
    DATABASE_URL:
      "postgresql://postgres.ref:password@copied.pooler.supabase.com:5432/postgres?sslmode=no-verify",
  });
  expect(options.ssl).toEqual({ rejectUnauthorized: true });
  expect(options.connectionString).not.toContain("sslmode");
  expect(
    databaseOptions({
      DATABASE_URL: "postgresql://x:y@remote:5432/db",
      DATABASE_SSL_CA: "certificate contents",
    }).ssl,
  ).toEqual({ rejectUnauthorized: true, ca: "certificate contents" });
  expect(() =>
    databaseOptions({ DATABASE_URL: "postgresql://x:y@host:6543/db" }),
  ).toThrow(/Session Pooler/);
  expect(
    databaseOptions({ DATABASE_URL: "postgresql://x:y@localhost:5432/db" }).ssl,
  ).toBe(false);
  expect(() => databaseOptions({ DATABASE_URL: "secret-bad-url" })).toThrow(
    "DATABASE_URL must be a PostgreSQL connection URL",
  );
});
it("checks actual database time and reports connection health in status", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    expect(await databaseHealth(db)).toMatchObject({ database: "healthy" });
    const response = await createApp(new PostgresStore(db), undefined, {
      head: async () => 1n,
    }).request("/v1/status");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      database: "healthy",
      status: "degraded",
    });
  } finally {
    await db.close();
  }
}, 30000);
it("reports unavailable database without leaking connection errors", async () => {
  const store = new PostgresStore({
    query: async () => {
      throw new Error("password=do-not-expose");
    },
  });
  const response = await createApp(store).request("/v1/status");
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    database: "unavailable",
    status: "unavailable",
  });
});
it("removes Supabase Data API role access without altering the ledger schema", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated;");
    await migrate(db);
    await db.exec("GRANT SELECT,INSERT ON blocks TO anon,authenticated;");
    await migrate(db);
    const { rows } = await db.query(
      "SELECT has_table_privilege('anon','blocks','SELECT') AS read,has_table_privilege('authenticated','blocks','INSERT') AS write",
    );
    expect(rows[0]).toEqual({ read: false, write: false });
  } finally {
    await db.close();
  }
}, 30000);
