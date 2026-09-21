-- Versioned projections can be rebuilt from retained explanations/raw receipts.
CREATE SEQUENCE ledger_projection_sequence;
ALTER TABLE transactions ADD COLUMN ledger_version integer NOT NULL DEFAULT 0;
ALTER TABLE transactions ADD COLUMN ledger_sequence bigint;
CREATE INDEX transactions_ledger_pending ON transactions(chain_id,block_number) WHERE ledger_version=0;
ALTER TABLE address_entries ADD COLUMN counterparty text;
ALTER TABLE address_entries ADD COLUMN fee_raw numeric(78,0) NOT NULL DEFAULT 0;
ALTER TABLE address_entries ADD COLUMN gross_change numeric(78,0) NOT NULL DEFAULT 0;
ALTER TABLE address_entries ADD COLUMN net_change numeric(78,0) NOT NULL DEFAULT 0;
ALTER TABLE address_entries ADD COLUMN entry_type text NOT NULL DEFAULT 'transfer';
ALTER TABLE address_entries ADD COLUMN transaction_index integer NOT NULL DEFAULT 0;
ALTER TABLE address_entries ADD COLUMN entry_index integer NOT NULL DEFAULT 0;
ALTER TABLE address_entries ADD COLUMN timestamp timestamptz;
CREATE INDEX address_entries_cursor ON address_entries(chain_id,address,block_number DESC,transaction_index DESC,transaction_hash DESC,entry_index DESC);
