// Read-only live benchmark with a persistent local PostgreSQL (PGlite) database.
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import { ARC_MAINNET, createArcRpc } from "@arcledger/arc-config";
import {
  migrate,
  checkpoint,
  commitRawBlock,
  PostgresStore,
  type SqlClient,
} from "@arcledger/database";
import { runIndexer, readIndexerOptions } from "../apps/indexer/src/worker.js";
import { readRawBlock } from "../apps/indexer/src/ingest.js";
import { mkdir, writeFile } from "node:fs/promises";
const rpc = createArcRpc(),
  head = await rpc.blockNumber();
const runDirectory = `.local/part2-${Date.now()}`;
await mkdir(runDirectory, { recursive: true });
const nativeUrl = process.env.SMOKE_DATABASE_URL;
if (
  nativeUrl &&
  !["localhost", "127.0.0.1", "[::1]"].includes(new URL(nativeUrl).hostname)
)
  throw new Error(
    "SMOKE_DATABASE_URL must point to a local test PostgreSQL server",
  );
const schema = `arcledger_smoke_${Date.now()}`;
async function openDatabase(): Promise<
  SqlClient & { close: () => Promise<void> }
> {
  if (!nativeUrl) return new PGlite(`${runDirectory}/postgres`);
  const client = new pg.Client({ connectionString: nativeUrl });
  await client.connect();
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  return Object.assign(client, { close: () => client.end() });
}
let db = await openDatabase();
await migrate(db);
let processed = 0,
  lastCommitted = head - 3n,
  retries = 0;
const firstStop = new AbortController();
const firstTimeout = setTimeout(() => firstStop.abort(), 120000);
const options = readIndexerOptions();
const connect = async () => ({
  db,
  close: async () => {
    await db.query("SELECT pg_advisory_unlock($1,1)", [ARC_MAINNET.chainId]);
  },
});
await runIndexer({
  rpc,
  connect,
  options: { ...options, startBlock: head - 2n },
  signal: firstStop.signal,
  onRetry: () => {
    retries++;
  },
  onProgress: (p) => {
    lastCommitted = BigInt(p.block);
    if (++processed === 5) firstStop.abort();
  },
});
clearTimeout(firstTimeout);
if (processed < 5) {
  await db.close();
  throw new Error(
    "Live smoke could not process five blocks within 120 seconds",
  );
}
const before = await checkpoint(db);
await db.close();
db = await openDatabase();
await migrate(db);
const resumed = await checkpoint(db);
if (resumed?.last_processed_block !== before?.last_processed_block)
  throw new Error("Checkpoint did not survive database restart");
const replay = await readRawBlock(rpc, BigInt(resumed!.last_processed_block));
await commitRawBlock(db, replay, (await rpc.blockNumber()).toString());
const duration = Number(process.env.SMOKE_DURATION_MS ?? 30000);
if (!Number.isSafeInteger(duration) || duration < 5000 || duration > 300000) {
  await db.close();
  throw new Error("SMOKE_DURATION_MS must be 5000–300000");
}
const stop = new AbortController(),
  timer = setTimeout(() => stop.abort(), duration);
const samples: { head: string; indexed: string; lag: number }[] = [];
let sampling = false;
const sampleTimer = setInterval(async () => {
  if (sampling) return;
  sampling = true;
  try {
    const observed = await rpc.blockNumber();
    samples.push({
      head: observed.toString(),
      indexed: lastCommitted.toString(),
      lag: Number(observed > lastCommitted ? observed - lastCommitted : 0n),
    });
  } catch {
    retries++;
  } finally {
    sampling = false;
  }
}, 750);
try {
  await runIndexer({
    rpc,
    connect,
    options: { ...options, startBlock: 0n },
    signal: stop.signal,
    onRetry: () => {
      retries++;
    },
    onProgress: (p) => {
      lastCommitted = BigInt(p.block);
      processed++;
    },
  });
} finally {
  clearTimeout(timer);
  clearInterval(sampleTimer);
}
const {
  rows: [counts],
} = await db.query(
  "SELECT (SELECT count(*)::int FROM blocks) blocks,(SELECT count(*)::int FROM transactions) transactions,(SELECT count(*)::int FROM raw_events) raw_events",
);
const lags = samples
  .slice(4)
  .map((s) => s.lag)
  .sort((a, b) => a - b);
const status = await new PostgresStore(db).status();
const report = {
  checkedAt: new Date().toISOString(),
  database: runDirectory,
  engine: nativeUrl ? "Native PostgreSQL" : "PGlite",
  schema: nativeUrl ? schema : undefined,
  options: { ...options, startBlock: options.startBlock?.toString() },
  scope:
    "Raw Mainnet ingestion with persistent restart and replay; no balance reconciliation",
  durationMs: duration,
  processed,
  retries,
  counts,
  checkpointBeforeRestart: before?.last_processed_block,
  checkpointAfterRestart: resumed?.last_processed_block,
  lag: {
    samples: lags.length,
    median: lags[Math.floor(lags.length * 0.5)] ?? null,
    p95: lags[Math.floor(lags.length * 0.95)] ?? null,
    max: lags.at(-1) ?? null,
    withinTwoBlocksPercent: lags.length
      ? Math.round((lags.filter((n) => n <= 2).length / lags.length) * 100)
      : null,
  },
  rpc: rpc.metrics,
  status,
  samples,
};
await writeFile(`${runDirectory}/report.json`, JSON.stringify(report, null, 2));
await writeFile(".local/part2-latest.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, samples: undefined }, null, 2));
await db.close();
