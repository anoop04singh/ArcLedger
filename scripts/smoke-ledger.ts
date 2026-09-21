import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { createArcRpc } from "@arcledger/arc-config";
import {
  migrate,
  commitRawBlock,
  projectPending,
  PostgresStore,
  type SqlClient,
} from "@arcledger/database";
import { formatUSDC } from "@arcledger/normalizer";
import { readRawBlock } from "../apps/indexer/src/ingest.js";
import { createApp } from "../apps/api/src/app.js";
const directory = `.local/part3-${Date.now()}`;
await mkdir(directory, { recursive: true });
const url = process.env.SMOKE_DATABASE_URL;
if (url && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname))
  throw new Error("Use a localhost test PostgreSQL server");
const schema = `arcledger_part3_${Date.now()}`;
let db: SqlClient, close: () => Promise<void>;
if (url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  db = client;
  close = () => client.end();
} else {
  const client = new PGlite(`${directory}/postgres`);
  db = client;
  close = () => client.close();
}
try {
  await migrate(db);
  await migrate(db);
  const rpc = createArcRpc(),
    head = await rpc.blockNumber();
  let address: `0x${string}` | undefined, txHash: string | undefined;
  for (let n = head - 4n; n <= head; n++) {
    const block = await readRawBlock(rpc, n, 32);
    await commitRawBlock(db, block, head.toString());
    const candidate = block.transactions[0]?.transaction;
    if (candidate && !address) {
      address = candidate.from;
      txHash = candidate.hash;
    }
  }
  let projected = 0;
  for (;;) {
    const result = await projectPending(db, 100);
    assert.equal(result.failed, 0);
    projected += result.projected;
    if (!result.projected) break;
  }
  assert(address && txHash, "Expected live transactions in the sample");
  const store = new PostgresStore(db),
    app = createApp(
      store,
      async (address) => {
        const block = await rpc.blockNumber();
        return { value: await rpc.balance(address, block), block };
      },
      { head: () => rpc.blockNumber() },
    );
  const get = async (path: string) => {
    const response = await app.request(path);
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const summary = await get(`/v1/address/${address}`);
  assert.equal(
    summary.balance,
    formatUSDC(await rpc.balance(address, BigInt(summary.balanceBlock)), 6),
  );
  const explanation = await get(`/v1/tx/${txHash}?includeRaw=true`);
  assert.equal(
    explanation.summary.fee,
    formatUSDC(
      BigInt(explanation.raw.raw_receipt.gasUsed) *
        BigInt(explanation.raw.raw_receipt.effectiveGasPrice),
      6,
    ),
  );
  const seen = new Set<string>();
  let cursor: string | null = null;
  do {
    const page = await get(
      `/v1/address/${address}/ledger?limit=2${cursor ? "&cursor=" + cursor : ""}`,
    );
    for (const entry of page.entries) {
      assert(!seen.has(entry.id));
      seen.add(entry.id);
    }
    cursor = page.nextCursor;
  } while (cursor);
  const {
    rows: [check],
  } =
    await db.query(`SELECT (SELECT count(*)::int FROM blocks) blocks,(SELECT count(*)::int FROM transactions) transactions,(SELECT count(*)::int FROM raw_events) raw_events,(SELECT count(*)::int FROM address_entries) entries,
    (SELECT COALESCE(sum(fee_raw),0)::text FROM transactions) receipt_fees,
    (SELECT COALESCE(sum(fee_raw),0)::text FROM address_entries) ledger_fees,
    (SELECT count(*)::int FROM address_entries WHERE net_change<>gross_change-fee_raw) invalid_net_changes`);
  assert.equal(check.receipt_fees, check.ledger_fees);
  assert.equal(check.invalid_net_changes, 0);
  assert.deepEqual(await projectPending(db), { projected: 0, failed: 0 });
  const report = {
    checkedAt: new Date().toISOString(),
    engine: url ? "Native PostgreSQL" : "PGlite",
    schema: url ? schema : undefined,
    firstBlock: (head - 4n).toString(),
    lastBlock: head.toString(),
    projected,
    counts: check,
    address,
    summary,
    ledgerEntriesRead: seen.size,
    txHash,
    normalization: explanation.normalization,
    status: await get("/v1/status"),
    checks: [
      "receipt fee equals gasUsed × effectiveGasPrice",
      "each sender fee appears once in ledger",
      "netChange equals grossChange minus fee",
      "current balance matches block-pinned eth_getBalance",
      "cursor traversal without duplicates",
      "projection replay idempotent",
    ],
  };
  await writeFile(`${directory}/report.json`, JSON.stringify(report, null, 2));
  await writeFile(".local/part3-latest.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await close();
}
