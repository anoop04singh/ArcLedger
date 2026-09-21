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
      for (const movement of explanation.movements) {
        await db.query(
          "INSERT INTO transfers(id,chain_id,transaction_hash,from_address,to_address,amount) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO NOTHING",
          [
            movement.id,
            ARC_MAINNET.chainId,
            explanation.hash,
            movement.from,
            movement.to,
            movement.amount,
          ],
        );
      }
      // Replace Part 2's provisional entries atomically, keeping all original raw data.
      await db.query(
        "DELETE FROM address_entries WHERE chain_id=$1 AND transaction_hash=$2",
        [ARC_MAINNET.chainId, explanation.hash],
      );
      for (const entry of constructAddressEntries(
        explanation,
        row.transaction_index ?? 0,
      )) {
        await db.query(
          `INSERT INTO address_entries(id,chain_id,address,transaction_hash,kind,amount_raw,block_number,counterparty,fee_raw,gross_change,net_change,entry_type,transaction_index,entry_index,timestamp)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO NOTHING`,
          [
            entry.id,
            ARC_MAINNET.chainId,
            entry.address,
            entry.txHash,
            entry.type === "network_fee"
              ? "fee"
              : entry.direction === "incoming"
                ? "received"
                : "sent",
            entry.amount,
            entry.blockNumber,
            entry.counterparty,
            entry.fee,
            entry.grossChange,
            entry.netChange,
            entry.type,
            entry.transactionIndex,
            entry.entryIndex,
            entry.timestamp,
          ],
        );
      }
      await db.query(
        "UPDATE transactions SET explanation=$3,ledger_version=1,ledger_sequence=nextval('ledger_projection_sequence') WHERE chain_id=$1 AND tx_hash=$2",
        [ARC_MAINNET.chainId, explanation.hash, JSON.stringify(explanation)],
      );
      projected++;
    }
    await db.query("COMMIT");
    return { projected, failed };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
