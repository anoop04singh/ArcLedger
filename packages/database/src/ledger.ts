import type {
  AddressEntry,
  Hex,
  LedgerPosition,
  LedgerPage,
} from "@arcledger/types";
import type { SqlClient } from "./index.js";
import { ARC_MAINNET } from "@arcledger/arc-config";
export async function readLedger(
  db: SqlClient,
  address: Hex,
  limit: number,
  snapshot?: string,
  after?: LedgerPosition,
): Promise<LedgerPage> {
  const upper =
    snapshot ??
    (
      await db.query(
        "SELECT COALESCE(max(ledger_sequence),0)::text n FROM transactions WHERE chain_id=$1",
        [ARC_MAINNET.chainId],
      )
    ).rows[0].n;
  const values: unknown[] = [ARC_MAINNET.chainId, address, upper, limit + 1];
  let boundary = "";
  if (after) {
    values.push(
      after.block,
      after.transactionIndex,
      after.hash,
      after.entryIndex,
    );
    boundary =
      "AND (e.block_number,e.transaction_index,e.transaction_hash,e.entry_index)<($5::numeric,$6::integer,$7::text,$8::integer)";
  }
  const { rows } = await db.query(
    `SELECT e.*,t.status FROM address_entries e JOIN transactions t ON t.chain_id=e.chain_id AND t.tx_hash=e.transaction_hash
    WHERE e.chain_id=$1 AND e.address=$2 AND t.ledger_version=1 AND t.ledger_sequence<=$3::bigint ${boundary}
    ORDER BY e.block_number DESC,e.transaction_index DESC,e.transaction_hash DESC,e.entry_index DESC LIMIT $4`,
    values,
  );
  const entries: AddressEntry[] = rows.slice(0, limit).map((r) => ({
    id: r.id,
    address: r.address,
    direction:
      r.entry_type === "self"
        ? "self"
        : r.kind === "received"
          ? "incoming"
          : "outgoing",
    counterparty: r.counterparty,
    amount: r.amount_raw,
    fee: r.fee_raw,
    grossChange: r.gross_change,
    netChange: r.net_change,
    type: r.entry_type,
    txHash: r.transaction_hash,
    blockNumber: r.block_number,
    transactionIndex: r.transaction_index,
    entryIndex: r.entry_index,
    timestamp: new Date(r.timestamp).toISOString(),
    final: true,
    status: r.status,
  }));
  return { entries, snapshot: upper, hasMore: rows.length > limit };
}
