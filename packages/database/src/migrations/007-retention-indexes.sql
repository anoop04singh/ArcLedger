-- Leading FK columns keep whole-block retention bounded instead of repeatedly scanning child tables.
CREATE INDEX IF NOT EXISTS transactions_retention_block ON transactions(block_number);
CREATE INDEX IF NOT EXISTS transfers_retention_tx ON transfers(transaction_hash);
CREATE INDEX IF NOT EXISTS address_entries_retention_tx ON address_entries(chain_id,transaction_hash);
CREATE INDEX IF NOT EXISTS address_entries_retention_transfer ON address_entries(chain_id,transfer_id) WHERE transfer_id IS NOT NULL;
