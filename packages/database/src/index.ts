export {
  enforceHistoryBudget,
  pruneOldestBlocks,
  databaseBytes,
  HISTORY_CAP_BYTES,
  HISTORY_TRIGGER_BYTES,
  StorageCapacityError,
} from "./retention.js";
import { latestValidation } from "./validation.js";
import { databaseHealth } from "./client.js";
export { createPool, databaseHealth, databaseOptions } from "./client.js";
import { readLedger } from "./ledger.js";
export { migrate } from "./migrations.js";
export {
  checkpoint,
  heartbeat,
  saveRawBlock,
  commitRawBlock,
  DataIntegrityError,
} from "./raw.js";
export { projectPending } from "./projection.js";
import { ARC_MAINNET } from "@arcledger/arc-config";
import type {
  AddressLedger,
  ExplainedTransaction,
  Hex,
  LedgerStatus,
  LedgerPosition,
  LedgerPage,
} from "@arcledger/types";
export type LegacyBlockRecord = {
  number: string;
  hash: Hex;
  parentHash: Hex;
  timestamp: string;
  transactions: ExplainedTransaction[];
};
export interface LedgerStore {
  recent?(): Promise<ExplainedTransaction[]>;
  mode: "demo" | "mainnet";
  health?(): Promise<{ database: "healthy"; checkedAt: string }>;
  transaction(hash: string): Promise<ExplainedTransaction | null>;
  address(address: Hex, limit: number, offset: number): Promise<AddressLedger>;
  status(): Promise<LedgerStatus>;
  rawTransaction?(hash: string): Promise<unknown | null>;
  ledger(
    address: Hex,
    limit: number,
    snapshot?: string,
    after?: LedgerPosition,
  ): Promise<LedgerPage>;
}
export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
  exec?(sql: string): Promise<unknown>;
}
export class PostgresStore implements LedgerStore {
  async recent(): Promise<ExplainedTransaction[]> {
    const { rows } = await this.db.query(
      "SELECT explanation FROM transactions WHERE chain_id=$1 AND ledger_version=1 AND explanation IS NOT NULL ORDER BY block_number DESC,transaction_index DESC,tx_hash DESC LIMIT 12",
      [ARC_MAINNET.chainId],
    );
    return rows.map((r) => r.explanation);
  }
  mode = "mainnet" as const;
  constructor(readonly db: SqlClient) {}
  health() {
    return databaseHealth(this.db);
  }
  ledger(
    address: Hex,
    limit: number,
    snapshot?: string,
    after?: LedgerPosition,
  ) {
    return readLedger(this.db, address, limit, snapshot, after);
  }
  async rawTransaction(hash: string) {
    const {
      rows: [row],
    } = await this.db.query(
      "SELECT chain_id,block_number,raw_transaction,raw_receipt FROM transactions WHERE chain_id=$1 AND tx_hash=$2",
      [ARC_MAINNET.chainId, hash],
    );
    if (!row?.raw_receipt) return null;
    const { rows: logs } = await this.db.query(
      "SELECT raw_log FROM raw_events WHERE chain_id=$1 AND transaction_hash=$2 ORDER BY log_index",
      [ARC_MAINNET.chainId, hash],
    );
    return { ...row, logs: logs.map((log) => log.raw_log) };
  }
  async transaction(hash: string) {
    const { rows } = await this.db.query(
      "SELECT explanation FROM transactions WHERE tx_hash=$1",
      [hash],
    );
    return rows[0]?.explanation ?? null;
  }
  async address(
    address: Hex,
    limit: number,
    offset: number,
  ): Promise<AddressLedger> {
    const {
      rows: [totals],
    } = await this.db.query(
      `SELECT
      COALESCE((SELECT sum(amount) FROM transfers WHERE to_address=$1 AND from_address<>to_address),0)::text AS received,
      COALESCE((SELECT sum(amount) FROM transfers WHERE from_address=$1 AND from_address<>to_address),0)::text AS sent,
      COALESCE((SELECT sum(fee_raw) FROM transactions WHERE from_address=$1),0)::text AS fees`,
      [address],
    );
    const where =
      "explanation IS NOT NULL AND (from_address=$1 OR tx_hash IN (SELECT transaction_hash FROM transfers WHERE from_address=$1 OR to_address=$1))";
    const {
      rows: [count],
    } = await this.db.query(
      `SELECT count(*)::int AS count FROM transactions WHERE from_address=$1 OR tx_hash IN (SELECT transaction_hash FROM transfers WHERE from_address=$1 OR to_address=$1)`,
      [address],
    );
    const { rows } = await this.db.query(
      `SELECT explanation FROM transactions WHERE ${where} ORDER BY block_number DESC, transaction_index DESC NULLS LAST, tx_hash DESC LIMIT $2 OFFSET $3`,
      [address, limit, offset],
    );
    const status = await this.status();
    return {
      address,
      mode: this.mode,
      balance: null,
      balanceBlock: null,
      received: totals.received,
      sent: totals.sent,
      feesPaid: totals.fees,
      transactionCount: count.count,
      transactions: rows.map((r) => r.explanation),
      nextOffset: offset + limit < count.count ? offset + limit : null,
      coverageStart: status.startBlock,
      pendingNormalization: status.pendingNormalization ?? 0,
    };
  }
  async status(): Promise<LedgerStatus> {
    const {
      rows: [state],
    } = await this.db.query("SELECT * FROM indexer_state WHERE chain_id=$1", [
      ARC_MAINNET.chainId,
    ]);
    const {
      rows: [counts],
    } = await this.db.query(`SELECT
      (SELECT count(*)::int FROM transfers) AS canonical,
      (SELECT count(*)::int FROM transactions t, jsonb_array_elements(t.explanation->'evidence') e WHERE e->>'disposition'='matched') AS duplicates,
      (SELECT COALESCE(sum(jsonb_array_length(explanation->'warnings')),0)::int FROM transactions) AS warnings,
      (SELECT count(*)::int FROM transactions WHERE ledger_version=0) AS pending,
      (SELECT count(*)::int FROM raw_events) AS raw_events,
      (SELECT count(*)::int FROM transactions WHERE raw_receipt IS NOT NULL) AS raw_transactions,
      (SELECT count(*)::int FROM transactions WHERE projection_error IS NOT NULL) AS projection_errors`);
    const validationRun = await latestValidation(this.db);
    const {
      rows: [retention],
    } = await this.db.query("SELECT * FROM retention_state WHERE chain_id=$1", [
      ARC_MAINNET.chainId,
    ]);
    const lag = state
      ? (
          BigInt(state.observed_head) - BigInt(state.last_processed_block)
        ).toString()
      : null;
    return {
      mode: this.mode,
      retention: retention
        ? {
            capBytes: Number(retention.cap_bytes),
            databaseBytes: Number(retention.database_bytes),
            prunedBlocks: Number(retention.pruned_blocks),
            prunedThrough: retention.pruned_through,
            state: retention.state,
            checkedAt: new Date(retention.checked_at).toISOString(),
          }
        : undefined,
      state: !state
        ? "idle"
        : Date.now() - new Date(state.updated_at).getTime() > 30_000
          ? "stale"
          : lag === "0"
            ? "live"
            : "syncing",
      chainId: ARC_MAINNET.chainId,
      latestIndexedBlock: state?.last_processed_block ?? null,
      latestFinalizedBlock: state?.observed_head ?? null,
      lag,
      startBlock: state?.start_block ?? null,
      updatedAt: state ? new Date(state.updated_at).toISOString() : null,
      canonicalTransfers: counts.canonical,
      duplicatesRemoved: counts.duplicates,
      normalizationWarnings: counts.warnings + counts.projection_errors,
      pendingNormalization: counts.pending,
      rawEvents: counts.raw_events,
      rawTransactions: counts.raw_transactions,
      rawCoverageStart: state?.raw_start_block ?? null,
      accountingMismatches:
        validationRun && validationRun.status !== "error"
          ? validationRun.accountingMismatches + validationRun.feeMismatches
          : null,
      validation: validationRun?.status ?? "not-run",
      validationRun,
    };
  }
}
export { DemoStore, DEMO_ADDRESS, DEMO_HASH } from "./demo.js";
export { databaseSnapshot } from "./diagnostics.js";
