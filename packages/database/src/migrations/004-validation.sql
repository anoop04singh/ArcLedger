CREATE TABLE validation_runs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 started_at timestamptz NOT NULL,
 completed_at timestamptz NOT NULL DEFAULT now(),
 start_block numeric(78,0) NOT NULL,
 end_block numeric(78,0) NOT NULL,
 blocks_scanned integer NOT NULL,
 transactions integer NOT NULL,
 raw_records integer NOT NULL,
 duplicate_records integer NOT NULL,
 canonical_movements integer NOT NULL,
 fee_mismatches integer NOT NULL,
 accounting_mismatches integer NOT NULL,
 status text NOT NULL CHECK(status IN ('valid','invalid','error')),
 scope text NOT NULL,
 issues jsonb NOT NULL DEFAULT '[]'
);
CREATE INDEX validation_runs_latest ON validation_runs(completed_at DESC,id DESC);
CREATE INDEX transfers_transaction ON transfers(chain_id,transaction_hash);
-- Reproject retained receipts once to preserve nonzero self-transfer records.
UPDATE transactions SET ledger_version=0 WHERE raw_receipt IS NOT NULL;
