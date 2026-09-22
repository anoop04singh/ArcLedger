import { assertWriteBudget } from "./retention.js";
import { ARC_MAINNET } from "@arcledger/arc-config";
import {
  normalizeArcTransaction,
  constructAddressEntries,
} from "@arcledger/normalizer";
import type { ExplainedTransaction, RpcReceipt } from "@arcledger/types";
import type { SqlClient } from "./index.js";
/** Separate downstream worker: raw capture and its checkpoint never depend on normalization. */
export async function projectPending(db: SqlClient, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new Error("Projection limit must be 1–1000");
  let projected = 0,
    failed = 0;
  await db.query("BEGIN");
  try {
    // Serialize projection commits so sequence snapshots cannot miss an earlier in-flight transaction.
    const {
      rows: [lock],
    } = await db.query("SELECT pg_try_advisory_xact_lock($1,2) AS acquired", [
      ARC_MAINNET.chainId,
    ]);
    if (!lock.acquired) {
      await db.query("COMMIT");
      return { projected, failed };
    }
    const { rows } = await db.query(
      "SELECT * FROM transactions WHERE chain_id=$1 AND ledger_version=0 AND (explanation IS NOT NULL OR raw_receipt IS NOT NULL) AND projection_error IS NULL ORDER BY block_number,transaction_index NULLS LAST,tx_hash LIMIT $2 FOR UPDATE",
      [ARC_MAINNET.chainId, limit],
    );
    const movements: Record<string, unknown>[] = [],
      entries: Record<string, unknown>[] = [],
      explanations: Record<string, unknown>[] = [];
    for (const row of rows) {
      let explanation: ExplainedTransaction;
      try {
        explanation = row.raw_receipt
          ? normalizeArcTransaction({
              receipt: row.raw_receipt as RpcReceipt,
              timestamp: new Date(row.timestamp).toISOString(),
            })
          : row.explanation;
      } catch {
        await db.query(
          "UPDATE transactions SET projection_error=$3 WHERE chain_id=$1 AND tx_hash=$2",
          [
            ARC_MAINNET.chainId,
            row.tx_hash,
            "Normalization rejected this record; inspect the retained raw payload.",
          ],
        );
        failed++;
        continue;
      }
      for (const m of explanation.movements)
        movements.push({
          id: m.id,
          transaction_hash: explanation.hash,
          from_address: m.from,
          to_address: m.to,
          amount: m.amount,
        });
      for (const e of constructAddressEntries(
        explanation,
        row.transaction_index ?? 0,
      ))
        entries.push({
          id: e.id,
          address: e.address,
          transaction_hash: e.txHash,
          kind:
            e.type === "network_fee"
              ? "fee"
              : e.direction === "incoming"
                ? "received"
                : "sent",
          amount_raw: e.amount,
          block_number: e.blockNumber,
          counterparty: e.counterparty,
          fee_raw: e.fee,
          gross_change: e.grossChange,
          net_change: e.netChange,
          entry_type: e.type,
          transaction_index: e.transactionIndex,
          entry_index: e.entryIndex,
          timestamp: e.timestamp,
        });
      explanations.push({ tx_hash: explanation.hash, explanation });
      projected++;
    }
    if (projected) {
      await db.query(
        "DELETE FROM address_entries WHERE chain_id=$1 AND transaction_hash=ANY($2::text[])",
        [ARC_MAINNET.chainId, explanations.map((e) => e.tx_hash)],
      );
      await db.query(
        `WITH movements AS (
        INSERT INTO transfers(chain_id,id,transaction_hash,from_address,to_address,amount)
        SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x(id text,transaction_hash text,from_address text,to_address text,amount numeric)
        ON CONFLICT(id) DO NOTHING RETURNING id
      ), entries AS (
        INSERT INTO address_entries(chain_id,id,address,transaction_hash,kind,amount_raw,block_number,counterparty,fee_raw,gross_change,net_change,entry_type,transaction_index,entry_index,timestamp)
        SELECT $1,x.* FROM jsonb_to_recordset($3::jsonb) AS x(id text,address text,transaction_hash text,kind text,amount_raw numeric,block_number numeric,counterparty text,fee_raw numeric,gross_change numeric,net_change numeric,entry_type text,transaction_index integer,entry_index integer,timestamp timestamptz)
        ON CONFLICT(id) DO NOTHING RETURNING id
      ) UPDATE transactions t SET explanation=x.explanation,ledger_version=1,ledger_sequence=nextval('ledger_projection_sequence')
        FROM jsonb_to_recordset($4::jsonb) AS x(tx_hash text,explanation jsonb) WHERE t.chain_id=$1 AND t.tx_hash=x.tx_hash`,
        [
          ARC_MAINNET.chainId,
          JSON.stringify(movements),
          JSON.stringify(entries),
          JSON.stringify(explanations),
        ],
      );
    }
    await assertWriteBudget(db);
    await db.query("COMMIT");
    return { projected, failed };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
