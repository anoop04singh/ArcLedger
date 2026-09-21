import { mkdir, writeFile } from "node:fs/promises";
import { createPool } from "@arcledger/database";
import { createArcRpc } from "@arcledger/arc-config";
import { readRawBlock } from "../apps/indexer/src/ingest.js";
import { saveValidation } from "../packages/database/src/validation.js";
import { readValidationSnapshot, validateSnapshot } from "./lib/validation.js";
import type { ValidationRun } from "@arcledger/types";
const pool = createPool();
const startedAt = new Date().toISOString();
let report: Omit<ValidationRun, "id" | "completedAt"> | undefined;
try {
  const {
    rows: [range],
  } = await pool.query(
    "SELECT min(block_number)::text first,max(block_number)::text last FROM blocks WHERE chain_id=5042 AND raw_complete=true",
  );
  if (!range.last)
    throw new Error(
      "No complete indexed blocks. Run the indexer and ledger worker first.",
    );
  const end = process.env.VALIDATION_END_BLOCK || range.last;
  const defaultStart =
    BigInt(end) - 4n > BigInt(range.first)
      ? BigInt(end) - 4n
      : BigInt(range.first);
  const start = process.env.VALIDATION_START_BLOCK || defaultStart.toString();
  if (
    !/^\d+$/.test(start) ||
    !/^\d+$/.test(end) ||
    BigInt(end) < BigInt(start) ||
    BigInt(end) - BigInt(start) >= 1000n
  )
    throw new Error("Choose a contiguous validation range of 1–1000 blocks.");
  report = {
    startedAt,
    startBlock: start,
    endBlock: end,
    blocksScanned: 0,
    transactions: 0,
    rawRecords: 0,
    duplicateRecords: 0,
    canonicalMovements: 0,
    feeMismatches: 0,
    accountingMismatches: 0,
    status: "error",
    scope:
      "Fresh Arc Mainnet RPC versus stored raw data, canonical movements, one-to-one duplicate evidence and address ledger fees/net changes. Sample only; not historical balance or validator-reward reconciliation.",
    issues: [],
  };
  const rpc = createArcRpc();
  const raw = [];
  for (let n = BigInt(start); n <= BigInt(end); n++) {
    raw.push(await readRawBlock(rpc, n, 32));
    console.log(`Fetched Arc Mainnet block ${n}`);
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = await readValidationSnapshot(db, start, end);
    await db.query("COMMIT");
    report = { ...report, ...validateSnapshot(raw, snapshot, start, end) };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
} catch (e) {
  // Never include provider URLs, PostgreSQL connection strings, or credentials in public reports.
  if (report) {
    report.status = "error";
    report.issues = [
      "Validation could not complete. Check RPC connectivity, database migrations, and normalization coverage; no valid result is asserted.",
    ];
  }
  console.error(
    "Mainnet validation could not complete; check connectivity and the indexed range.",
  );
  process.exitCode = 1;
} finally {
  try {
    if (report) {
      await saveValidation(pool, report);
      await mkdir(".local", { recursive: true });
      await writeFile(
        ".local/mainnet-validation.json",
        JSON.stringify(report, null, 2),
      );
      console.log(
        `\nArcLedger Mainnet Validation\nRange: ${report.startBlock}–${report.endBlock}\nBlocks scanned: ${report.blocksScanned}\nTransactions: ${report.transactions}\nRaw USDC records: ${report.rawRecords}\nDuplicate representations: ${report.duplicateRecords}\nCanonical movements: ${report.canonicalMovements}\nFee mismatches: ${report.feeMismatches}\nAccounting mismatches: ${report.accountingMismatches}\n${report.status.toUpperCase()}\n${report.scope}`,
      );
      for (const issue of report.issues) console.log(issue);
      if (report.status !== "valid") process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}
