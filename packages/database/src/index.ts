import pg from "pg";
import { readFile } from "node:fs/promises";
import { ARC_MAINNET } from "@arcledger/arc-config";
import type {
  AddressLedger,
  ExplainedTransaction,
  Hex,
  LedgerStatus,
} from "@arcledger/types";
export type BlockRecord = {
  number: string;
  hash: Hex;
  parentHash: Hex;
  timestamp: string;
  transactions: ExplainedTransaction[];
};
export interface LedgerStore {
  mode: "demo" | "mainnet";
  transaction(hash: string): Promise<ExplainedTransaction | null>;
  address(address: Hex, limit: number, offset: number): Promise<AddressLedger>;
  status(): Promise<LedgerStatus>;
}
export interface SqlClient {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
  exec?(sql: string): Promise<unknown>;
}
export async function migrate(db: SqlClient) {
  const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  if (db.exec) await db.exec(sql);
  else await db.query(sql);
}
export class PostgresStore implements LedgerStore {
  mode = "mainnet" as const;
  constructor(readonly db: SqlClient) {}
  async transaction(hash: string) {
    const { rows } = await this.db.query(
      "SELECT explanation FROM transactions WHERE hash=$1",
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
      COALESCE((SELECT sum(amount) FROM movements WHERE to_address=$1),0)::text AS received,
      COALESCE((SELECT sum(amount) FROM movements WHERE from_address=$1),0)::text AS sent,
      COALESCE((SELECT sum(fee) FROM transactions WHERE sender=$1),0)::text AS fees`,
      [address],
    );
    const where =
      "sender=$1 OR hash IN (SELECT transaction_hash FROM movements WHERE from_address=$1 OR to_address=$1)";
    const {
      rows: [count],
    } = await this.db.query(
      `SELECT count(*)::int AS count FROM transactions WHERE ${where}`,
      [address],
    );
    const { rows } = await this.db.query(
      `SELECT explanation FROM transactions WHERE ${where} ORDER BY block_number DESC, hash DESC LIMIT $2 OFFSET $3`,
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
    };
  }
  async status(): Promise<LedgerStatus> {
    const {
      rows: [state],
    } = await this.db.query("SELECT * FROM indexer_state WHERE id=1");
    const {
      rows: [counts],
    } = await this.db.query(`SELECT
      (SELECT count(*)::int FROM movements) AS canonical,
      (SELECT count(*)::int FROM transactions t, jsonb_array_elements(t.explanation->'evidence') e WHERE e->>'disposition'='matched') AS duplicates,
      (SELECT COALESCE(sum(jsonb_array_length(explanation->'warnings')),0)::int FROM transactions) AS warnings`);
    const lag = state
      ? (BigInt(state.finalized_head) - BigInt(state.latest_block)).toString()
      : null;
    return {
      mode: this.mode,
      state: !state
        ? "idle"
        : Date.now() - new Date(state.updated_at).getTime() > 30_000
          ? "stale"
          : lag === "0"
            ? "live"
            : "syncing",
      chainId: ARC_MAINNET.chainId,
      latestIndexedBlock: state?.latest_block ?? null,
      latestFinalizedBlock: state?.finalized_head ?? null,
      lag,
      startBlock: state?.start_block ?? null,
      updatedAt: state ? new Date(state.updated_at).toISOString() : null,
      canonicalTransfers: counts.canonical,
      duplicatesRemoved: counts.duplicates,
      normalizationWarnings: counts.warnings,
      accountingMismatches: null,
      validation: "not-run",
    };
  }
}
// Caller holds a dedicated connection and transaction. Block, evidence, movements,
// and checkpoint commit atomically; exact replays are safe, conflicting forks stop.
export async function saveBlock(
  db: SqlClient,
  block: BlockRecord,
  head: string,
) {
  const {
    rows: [existing],
  } = await db.query("SELECT hash FROM blocks WHERE number=$1", [block.number]);
  if (existing) {
    if (existing.hash !== block.hash)
      throw new Error("Finalized block hash conflict");
    return;
  }
  const {
    rows: [state],
  } = await db.query("SELECT * FROM indexer_state WHERE id=1 FOR UPDATE");
  if (state) {
    if (BigInt(block.number) !== BigInt(state.latest_block) + 1n)
      throw new Error("Non-contiguous block ingestion");
    const {
      rows: [previous],
    } = await db.query("SELECT hash FROM blocks WHERE number=$1", [
      state.latest_block,
    ]);
    if (previous?.hash !== block.parentHash)
      throw new Error("Finalized parent hash conflict");
  }
  await db.query(
    "INSERT INTO blocks(number,hash,parent_hash,timestamp) VALUES($1,$2,$3,$4)",
    [block.number, block.hash, block.parentHash, block.timestamp],
  );
  for (const tx of block.transactions) {
    if (tx.blockNumber !== block.number || tx.blockHash !== block.hash)
      throw new Error("Receipt block mismatch");
    await db.query(
      "INSERT INTO transactions(hash,block_number,sender,fee,explanation) VALUES($1,$2,$3,$4,$5)",
      [tx.hash, block.number, tx.sender, tx.fee, JSON.stringify(tx)],
    );
    for (const m of tx.movements)
      await db.query(
        "INSERT INTO movements(id,transaction_hash,from_address,to_address,amount) VALUES($1,$2,$3,$4,$5)",
        [m.id, tx.hash, m.from, m.to, m.amount],
      );
  }
  await db.query(
    `INSERT INTO indexer_state(id,start_block,latest_block,finalized_head) VALUES(1,$1,$1,$2)
    ON CONFLICT(id) DO UPDATE SET latest_block=$1,finalized_head=$2,updated_at=now()`,
    [block.number, head],
  );
}
export function createPool() {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required in mainnet mode");
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 5000,
  });
}
export { DemoStore, DEMO_ADDRESS, DEMO_HASH } from "./demo.js";
