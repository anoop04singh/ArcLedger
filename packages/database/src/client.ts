import pg from "pg";
import { readFileSync } from "node:fs";
import type { SqlClient } from "./index.js";
/** One connection factory for all persistent backend processes. Session semantics are required. */
export function databaseOptions(
  env: NodeJS.ProcessEnv = process.env,
): pg.PoolConfig {
  if (!env.DATABASE_URL)
    throw new Error("DATABASE_URL is required in mainnet mode");
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new Error("DATABASE_URL must use PostgreSQL");
  if (url.port === "6543")
    throw new Error(
      "ArcLedger requires a direct or Session Pooler connection, not port 6543",
    );
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const caFile =
    env.DATABASE_SSL_CA_FILE || url.searchParams.get("sslrootcert");
  const ca =
    env.DATABASE_SSL_CA || (caFile ? readFileSync(caFile, "utf8") : undefined);
  const tls =
    !local || url.searchParams.get("sslmode") === "verify-full" || !!ca;
  // Prevent connection-string SSL options from overriding certificate verification.
  for (const key of [
    "ssl",
    "sslmode",
    "sslrootcert",
    "sslcert",
    "sslkey",
    "uselibpqcompat",
  ])
    url.searchParams.delete(key);
  const max = Number(env.DATABASE_POOL_MAX ?? 5);
  if (!Number.isSafeInteger(max) || max < 1 || max > 20)
    throw new Error("DATABASE_POOL_MAX must be 1–20");
  return {
    connectionString: url.toString(),
    ssl: tls
      ? {
          rejectUnauthorized: true,
          ...(ca ? { ca } : {}),
        }
      : false,
    max,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    query_timeout: 20000,
    application_name: "arcledger",
  };
}
export function createPool() {
  return new pg.Pool(databaseOptions());
}
export async function databaseHealth(db: SqlClient) {
  const {
    rows: [row],
  } = await db.query("SELECT NOW() AS checked_at");
  return {
    database: "healthy" as const,
    checkedAt: new Date(row.checked_at).toISOString(),
  };
}
