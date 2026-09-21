import { ARC_MAINNET } from "@arcledger/arc-config";
import type { RawBlockRecord } from "@arcledger/types";
import type { SqlClient } from "./index.js";
export class DataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataIntegrityError";
  }
}
export async function checkpoint(db: SqlClient) {
  const {
    rows: [state],
  } = await db.query("SELECT * FROM indexer_state WHERE chain_id=$1", [
    ARC_MAINNET.chainId,
  ]);
  return state as
    | {
        last_processed_block: string;
        start_block: string;
        raw_start_block: string | null;
        observed_head: string;
      }
    | undefined;
}
export async function heartbeat(db: SqlClient, head: bigint) {
  await db.query(
    "UPDATE indexer_state SET observed_head=GREATEST(observed_head,$2),updated_at=now() WHERE chain_id=$1",
    [ARC_MAINNET.chainId, head.toString()],
  );
}
/** Caller owns the transaction. Raw writes and the cursor have one commit boundary. */
export async function saveRawBlock(
  db: SqlClient,
  block: RawBlockRecord,
  head: string,
) {
  const chain = ARC_MAINNET.chainId;
  if (block.chainId !== chain) throw new DataIntegrityError("Unexpected chain");
  if (BigInt(head) < BigInt(block.number))
    throw new DataIntegrityError("Block beyond observed head");
  const {
    rows: [state],
  } = await db.query(
    "SELECT * FROM indexer_state WHERE chain_id=$1 FOR UPDATE",
    [chain],
  );
  const {
    rows: [existing],
  } = await db.query(
    "SELECT block_hash,raw_complete FROM blocks WHERE chain_id=$1 AND block_number=$2",
    [chain, block.number],
  );
  if (existing?.block_hash && existing.block_hash !== block.hash)
    throw new DataIntegrityError("Committed block hash conflict");
  if (existing?.raw_complete) return false;
  if (state && !existing) {
    if (BigInt(block.number) !== BigInt(state.last_processed_block) + 1n)
      throw new DataIntegrityError("Non-contiguous block ingestion");
    const {
      rows: [previous],
    } = await db.query(
      "SELECT block_hash FROM blocks WHERE chain_id=$1 AND block_number=$2",
      [chain, state.last_processed_block],
    );
    if (previous?.block_hash !== block.parentHash)
      throw new DataIntegrityError("Committed parent hash conflict");
  }
  const txRows = block.transactions.map(({ transaction: t, receipt: r }) => {
    if (
      t.blockHash !== block.hash ||
      r.blockHash !== block.hash ||
      BigInt(t.blockNumber) !== BigInt(block.number) ||
      BigInt(r.blockNumber) !== BigInt(block.number) ||
      t.hash !== r.transactionHash
    )
      throw new DataIntegrityError("Receipt block mismatch");
    return {
      tx_hash: t.hash.toLowerCase(),
      block_number: block.number,
      transaction_index: Number(BigInt(t.transactionIndex)),
      from_address: t.from.toLowerCase(),
      to_address: t.to?.toLowerCase() ?? null,
      value: BigInt(t.value).toString(),
      status: BigInt(r.status) === 1n ? "success" : "reverted",
      gas_used: BigInt(r.gasUsed).toString(),
      effective_gas_price: BigInt(r.effectiveGasPrice).toString(),
      fee_raw: (BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice)).toString(),
      timestamp: block.timestamp,
      raw_transaction: t,
      raw_receipt: r,
    };
  });
  const logRows = block.logs.map((log) => {
    if (
      log.blockHash !== block.hash ||
      BigInt(log.blockNumber) !== BigInt(block.number)
    )
      throw new DataIntegrityError("Log block mismatch");
    return {
      block_number: block.number,
      block_hash: block.hash,
      transaction_hash: log.transactionHash.toLowerCase(),
      transaction_index: Number(BigInt(log.transactionIndex)),
      log_index: Number(BigInt(log.logIndex)),
      emitter: log.address.toLowerCase(),
      topic0: log.topics[0]?.toLowerCase() ?? null,
      topics: log.topics,
      data: log.data,
      timestamp: block.timestamp,
      raw_log: log,
    };
  });
  await db.query(
    `INSERT INTO blocks(chain_id,block_number,block_hash,parent_hash,timestamp,raw_block) VALUES($1,$2,$3,$4,$5,$6)
 ON CONFLICT(chain_id,block_number) DO UPDATE SET raw_block=COALESCE(blocks.raw_block,EXCLUDED.raw_block)`,
    [
      chain,
      block.number,
      block.hash,
      block.parentHash,
      block.timestamp,
      JSON.stringify(block.raw),
    ],
  );
  const { rows: written } = await db.query(
    `INSERT INTO transactions(chain_id,tx_hash,block_number,transaction_index,from_address,to_address,value,status,gas_used,effective_gas_price,fee_raw,timestamp,raw_transaction,raw_receipt)
 SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x(tx_hash text,block_number numeric,transaction_index integer,from_address text,to_address text,value numeric,status text,gas_used numeric,effective_gas_price numeric,fee_raw numeric,timestamp timestamptz,raw_transaction jsonb,raw_receipt jsonb)
 ON CONFLICT(chain_id,tx_hash) DO UPDATE SET transaction_index=EXCLUDED.transaction_index,to_address=EXCLUDED.to_address,value=EXCLUDED.value,status=EXCLUDED.status,gas_used=EXCLUDED.gas_used,effective_gas_price=EXCLUDED.effective_gas_price,timestamp=EXCLUDED.timestamp,raw_transaction=COALESCE(transactions.raw_transaction,EXCLUDED.raw_transaction),raw_receipt=COALESCE(transactions.raw_receipt,EXCLUDED.raw_receipt)
 WHERE transactions.block_number=EXCLUDED.block_number AND transactions.from_address=EXCLUDED.from_address AND transactions.fee_raw=EXCLUDED.fee_raw RETURNING tx_hash`,
    [chain, JSON.stringify(txRows)],
  );
  if (written.length !== txRows.length)
    throw new DataIntegrityError("Transaction conflicts with stored record");
  await db.query(
    `INSERT INTO raw_events(chain_id,block_number,block_hash,transaction_hash,transaction_index,log_index,emitter,topic0,topics,data,timestamp,raw_log)
 SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x(block_number numeric,block_hash text,transaction_hash text,transaction_index integer,log_index integer,emitter text,topic0 text,topics jsonb,data text,timestamp timestamptz,raw_log jsonb)
 ON CONFLICT(chain_id,transaction_hash,log_index) DO NOTHING`,
    [chain, JSON.stringify(logRows)],
  );
  const {
    rows: [counts],
  } = await db.query(
    `SELECT (SELECT count(*)::int FROM transactions WHERE chain_id=$1 AND block_number=$2) AS txs,(SELECT count(*)::int FROM raw_events WHERE chain_id=$1 AND block_number=$2) AS logs`,
    [chain, block.number],
  );
  if (counts.txs !== txRows.length || counts.logs !== logRows.length)
    throw new DataIntegrityError("Incomplete raw block write");
  await db.query(
    "UPDATE blocks SET raw_complete=true,processed_at=now() WHERE chain_id=$1 AND block_number=$2",
    [chain, block.number],
  );
  await db.query(
    `INSERT INTO indexer_state(chain_id,start_block,last_processed_block,observed_head,raw_start_block) VALUES($1,$2,$2,$3,$2)
 ON CONFLICT(chain_id) DO UPDATE SET last_processed_block=GREATEST(indexer_state.last_processed_block,EXCLUDED.last_processed_block),observed_head=GREATEST(indexer_state.observed_head,EXCLUDED.observed_head),raw_start_block=COALESCE(indexer_state.raw_start_block,EXCLUDED.raw_start_block),updated_at=now()`,
    [chain, block.number, head],
  );
  return true;
}
export async function commitRawBlock(
  db: SqlClient,
  block: RawBlockRecord,
  head: string,
) {
  await db.query("BEGIN");
  try {
    const inserted = await saveRawBlock(db, block, head);
    await db.query("COMMIT");
    return inserted;
  } catch (error) {
    try {
      await db.query("ROLLBACK");
    } catch {
      /* The connection owner reconnects before retrying. */
    }
    throw error;
  }
}
