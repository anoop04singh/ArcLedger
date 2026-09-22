import { restrictBrowserAccess } from "./access.js";
import { readFile } from "node:fs/promises";
import type { SqlClient } from "./index.js";
/** Pass a dedicated connection: migration version and DDL commit together. */
export async function migrate(db: SqlClient) {
  await db.query("BEGIN");
  try {
    await db.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    await db.query("LOCK TABLE schema_migrations IN EXCLUSIVE MODE");
    for (const [name, path] of [
      ["001-foundation", "./schema.sql"],
      ["002-raw", "./migrations/002-raw.sql"],
      ["003-ledger", "./migrations/003-ledger.sql"],
      ["004-validation", "./migrations/004-validation.sql"],
      ["005-self-records", "./migrations/005-self-records.sql"],
      ["006-retention", "./migrations/006-retention.sql"],
      ["007-retention-indexes", "./migrations/007-retention-indexes.sql"],
      ["008-retention-batches", "./migrations/008-retention-batches.sql"],
      ["009-atomic-ingest", "./migrations/009-atomic-ingest.sql"],
    ]) {
      const { rows } = await db.query(
        "SELECT name FROM schema_migrations WHERE name=$1",
        [name],
      );
      if (rows.length) continue;
      const sql = await readFile(new URL(path, import.meta.url), "utf8");
      if (db.exec) await db.exec(sql);
      else await db.query(sql);
      await db.query(
        "INSERT INTO schema_migrations(name) VALUES($1) ON CONFLICT DO NOTHING",
        [name],
      );
    }
    await restrictBrowserAccess(db);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
