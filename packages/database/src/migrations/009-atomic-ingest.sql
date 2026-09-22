-- One atomic RPC to PostgreSQL; no SECURITY DEFINER privileges.
CREATE FUNCTION public.arcledger_ingest(p_chain bigint,p_number numeric,p_hash text,p_parent text,p_timestamp timestamptz,p_raw jsonb,p_txs jsonb,p_logs jsonb,p_head numeric)
RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE state indexer_state%ROWTYPE; existing blocks%ROWTYPE; previous text; written integer; tx_count integer; log_count integer;
BEGIN
 IF p_chain<>5042 OR p_head<p_number THEN RAISE EXCEPTION 'Unexpected chain or head'; END IF;
 SELECT * INTO state FROM indexer_state WHERE chain_id=p_chain FOR UPDATE;
 SELECT * INTO existing FROM blocks WHERE chain_id=p_chain AND block_number=p_number;
 IF existing.block_hash IS NOT NULL AND existing.block_hash<>p_hash THEN RAISE EXCEPTION 'Committed block hash conflict'; END IF;
 IF existing.raw_complete THEN RETURN false; END IF;
 IF state.chain_id IS NOT NULL AND existing.block_hash IS NULL THEN
  IF p_number<>state.last_processed_block+1 THEN RAISE EXCEPTION 'Non-contiguous block ingestion'; END IF;
  SELECT block_hash INTO previous FROM blocks WHERE chain_id=p_chain AND block_number=state.last_processed_block;
  IF previous IS DISTINCT FROM p_parent THEN RAISE EXCEPTION 'Committed parent hash conflict'; END IF;
 END IF;
 WITH saved_block AS (
      INSERT INTO blocks(chain_id,block_number,block_hash,parent_hash,timestamp,raw_block,raw_complete) VALUES(p_chain,p_number,p_hash,p_parent,p_timestamp,p_raw,true)
      ON CONFLICT(chain_id,block_number) DO UPDATE SET raw_block=COALESCE(blocks.raw_block,EXCLUDED.raw_block),raw_complete=true,processed_at=now() RETURNING block_number
    ), saved_transactions AS (
      INSERT INTO transactions(chain_id,tx_hash,block_number,transaction_index,from_address,to_address,value,status,gas_used,effective_gas_price,fee_raw,timestamp,raw_transaction,raw_receipt)
      SELECT p_chain,x.* FROM jsonb_to_recordset(p_txs::jsonb) AS x(tx_hash text,block_number numeric,transaction_index integer,from_address text,to_address text,value numeric,status text,gas_used numeric,effective_gas_price numeric,fee_raw numeric,timestamp timestamptz,raw_transaction jsonb,raw_receipt jsonb) CROSS JOIN saved_block b
      ON CONFLICT(chain_id,tx_hash) DO UPDATE SET transaction_index=EXCLUDED.transaction_index,to_address=EXCLUDED.to_address,value=EXCLUDED.value,status=EXCLUDED.status,gas_used=EXCLUDED.gas_used,effective_gas_price=EXCLUDED.effective_gas_price,timestamp=EXCLUDED.timestamp,raw_transaction=COALESCE(transactions.raw_transaction,EXCLUDED.raw_transaction),raw_receipt=COALESCE(transactions.raw_receipt,EXCLUDED.raw_receipt)
      WHERE transactions.block_number=EXCLUDED.block_number AND transactions.from_address=EXCLUDED.from_address AND transactions.fee_raw=EXCLUDED.fee_raw RETURNING tx_hash
    ), saved_logs AS (
      INSERT INTO raw_events(chain_id,block_number,block_hash,transaction_hash,transaction_index,log_index,emitter,topic0,topics,data,timestamp,raw_log)
      SELECT p_chain,x.* FROM jsonb_to_recordset(p_logs::jsonb) AS x(block_number numeric,block_hash text,transaction_hash text,transaction_index integer,log_index integer,emitter text,topic0 text,topics jsonb,data text,timestamp timestamptz,raw_log jsonb)
      ON CONFLICT(chain_id,transaction_hash,log_index) DO NOTHING RETURNING id
    ), saved_state AS (
      INSERT INTO indexer_state(chain_id,start_block,last_processed_block,observed_head,raw_start_block) VALUES(p_chain,p_number,p_number,p_head,p_number)
      ON CONFLICT(chain_id) DO UPDATE SET last_processed_block=GREATEST(indexer_state.last_processed_block,EXCLUDED.last_processed_block),observed_head=GREATEST(indexer_state.observed_head,EXCLUDED.observed_head),raw_start_block=COALESCE(indexer_state.raw_start_block,EXCLUDED.raw_start_block),updated_at=now() RETURNING chain_id
    ) SELECT count(*)::int INTO written FROM saved_transactions;
 IF written<>jsonb_array_length(p_txs) THEN RAISE EXCEPTION 'Transaction conflicts with stored record'; END IF;
 SELECT count(*) INTO tx_count FROM transactions WHERE chain_id=p_chain AND block_number=p_number;
 SELECT count(*) INTO log_count FROM raw_events WHERE chain_id=p_chain AND block_number=p_number;
 IF tx_count<>jsonb_array_length(p_txs) OR log_count<>jsonb_array_length(p_logs) THEN RAISE EXCEPTION 'Incomplete raw block write'; END IF;
 IF pg_database_size(current_database())>=300000000 THEN RAISE EXCEPTION 'Storage write rolled back; retention required' USING ERRCODE='P0004'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.arcledger_ingest(bigint,numeric,text,text,timestamptz,jsonb,jsonb,jsonb,numeric) FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON FUNCTION public.arcledger_ingest(bigint,numeric,text,text,timestamptz,jsonb,jsonb,jsonb,numeric) FROM %I',r);
  END IF;
 END LOOP;
END $$;
