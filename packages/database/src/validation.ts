import type { ValidationRun } from "@arcledger/types";
import type { SqlClient } from "./index.js";
export async function latestValidation(
  db: SqlClient,
): Promise<ValidationRun | null> {
  const {
    rows: [r],
  } = await db.query(
    "SELECT * FROM validation_runs ORDER BY completed_at DESC,id DESC LIMIT 1",
  );
  return r
    ? {
        id: String(r.id),
        startedAt: new Date(r.started_at).toISOString(),
        completedAt: new Date(r.completed_at).toISOString(),
        startBlock: r.start_block,
        endBlock: r.end_block,
        blocksScanned: r.blocks_scanned,
        transactions: r.transactions,
        rawRecords: r.raw_records,
        duplicateRecords: r.duplicate_records,
        canonicalMovements: r.canonical_movements,
        feeMismatches: r.fee_mismatches,
        accountingMismatches: r.accounting_mismatches,
        status: r.status,
        scope: r.scope,
        issues: r.issues,
      }
    : null;
}
export async function saveValidation(
  db: SqlClient,
  r: Omit<ValidationRun, "id" | "completedAt">,
) {
  await db.query(
    `INSERT INTO validation_runs(started_at,start_block,end_block,blocks_scanned,transactions,raw_records,duplicate_records,canonical_movements,fee_mismatches,accounting_mismatches,status,scope,issues) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      r.startedAt,
      r.startBlock,
      r.endBlock,
      r.blocksScanned,
      r.transactions,
      r.rawRecords,
      r.duplicateRecords,
      r.canonicalMovements,
      r.feeMismatches,
      r.accountingMismatches,
      r.status,
      r.scope,
      JSON.stringify(r.issues),
    ],
  );
}
