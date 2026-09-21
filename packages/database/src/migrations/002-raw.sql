-- Upgrade Part 1 without fabricating raw payloads for older records.
ALTER TABLE blocks RENAME COLUMN number TO block_number;
ALTER TABLE blocks RENAME COLUMN hash TO block_hash;
ALTER TABLE blocks ADD COLUMN chain_id integer NOT NULL DEFAULT 5042;
ALTER TABLE blocks ADD COLUMN processed_at timestamptz;
ALTER TABLE blocks ADD COLUMN raw_block jsonb;
ALTER TABLE blocks ADD COLUMN raw_complete boolean NOT NULL DEFAULT false;
ALTER TABLE blocks ADD CONSTRAINT blocks_chain_number UNIQUE(chain_id,block_number);

ALTER TABLE transactions RENAME COLUMN hash TO tx_hash;
ALTER TABLE transactions RENAME COLUMN sender TO from_address;
ALTER TABLE transactions RENAME COLUMN fee TO fee_raw;
ALTER TABLE transactions ALTER COLUMN explanation DROP NOT NULL;
ALTER TABLE transactions ADD COLUMN chain_id integer NOT NULL DEFAULT 5042;
ALTER TABLE transactions ADD COLUMN transaction_index integer;
ALTER TABLE transactions ADD COLUMN to_address text;
ALTER TABLE transactions ADD COLUMN value numeric(78,0) CHECK(value>=0);
ALTER TABLE transactions ADD COLUMN status text CHECK(status IN ('success','reverted'));
ALTER TABLE transactions ADD COLUMN gas_used numeric(78,0) CHECK(gas_used>=0);
ALTER TABLE transactions ADD COLUMN effective_gas_price numeric(78,0) CHECK(effective_gas_price>=0);
ALTER TABLE transactions ADD COLUMN timestamp timestamptz;
ALTER TABLE transactions ADD COLUMN raw_transaction jsonb;
ALTER TABLE transactions ADD COLUMN raw_receipt jsonb;
ALTER TABLE transactions ADD COLUMN projection_error text;
ALTER TABLE transactions ADD CONSTRAINT transactions_chain_hash UNIQUE(chain_id,tx_hash);
ALTER TABLE transactions ADD CONSTRAINT transactions_chain_block FOREIGN KEY(chain_id,block_number) REFERENCES blocks(chain_id,block_number);
UPDATE transactions t SET timestamp=b.timestamp,status=t.explanation->>'status' FROM blocks b WHERE b.block_number=t.block_number;
CREATE INDEX transactions_block_order ON transactions(chain_id,block_number,transaction_index);
CREATE INDEX transactions_projection_pending ON transactions(chain_id,block_number) WHERE explanation IS NULL;

ALTER TABLE movements RENAME TO transfers;
ALTER TABLE transfers ADD COLUMN chain_id integer NOT NULL DEFAULT 5042;
ALTER TABLE transfers ADD CONSTRAINT transfers_chain_id UNIQUE(chain_id,id);
ALTER TABLE transfers ADD CONSTRAINT transfers_chain_tx FOREIGN KEY(chain_id,transaction_hash) REFERENCES transactions(chain_id,tx_hash);

CREATE TABLE raw_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 chain_id integer NOT NULL,
 block_number numeric(78,0) NOT NULL,
 block_hash text NOT NULL,
 transaction_hash text NOT NULL,
 transaction_index integer NOT NULL CHECK(transaction_index>=0),
 log_index integer NOT NULL CHECK(log_index>=0),
 emitter text NOT NULL,
 topic0 text,
 topics jsonb NOT NULL CHECK(jsonb_typeof(topics)='array'),
 data text NOT NULL,
 timestamp timestamptz NOT NULL,
 raw_log jsonb NOT NULL,
 UNIQUE(chain_id,transaction_hash,log_index),
 FOREIGN KEY(chain_id,block_number) REFERENCES blocks(chain_id,block_number),
 FOREIGN KEY(chain_id,transaction_hash) REFERENCES transactions(chain_id,tx_hash)
);
CREATE INDEX raw_events_block_order ON raw_events(chain_id,block_number,log_index);
CREATE INDEX raw_events_emitter_topic ON raw_events(chain_id,emitter,topic0,block_number);

CREATE TABLE address_entries (
 id text PRIMARY KEY,
 chain_id integer NOT NULL,
 address text NOT NULL,
 transaction_hash text NOT NULL,
 transfer_id text,
 kind text NOT NULL CHECK(kind IN ('received','sent','fee')),
 amount_raw numeric(78,0) NOT NULL CHECK(amount_raw>=0),
 block_number numeric(78,0) NOT NULL,
 UNIQUE(chain_id,address,transaction_hash,id),
 FOREIGN KEY(chain_id,transaction_hash) REFERENCES transactions(chain_id,tx_hash),
 FOREIGN KEY(chain_id,transfer_id) REFERENCES transfers(chain_id,id)
);
CREATE INDEX address_entries_history ON address_entries(chain_id,address,block_number DESC);

ALTER TABLE indexer_state DROP CONSTRAINT indexer_state_pkey;
ALTER TABLE indexer_state DROP CONSTRAINT indexer_state_id_check;
ALTER TABLE indexer_state DROP COLUMN id;
ALTER TABLE indexer_state ADD COLUMN chain_id integer PRIMARY KEY DEFAULT 5042;
ALTER TABLE indexer_state RENAME COLUMN latest_block TO last_processed_block;
ALTER TABLE indexer_state RENAME COLUMN finalized_head TO observed_head;
ALTER TABLE indexer_state ADD COLUMN raw_start_block numeric(78,0);

CREATE TABLE webhooks (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 chain_id integer NOT NULL,
 url text NOT NULL,
 address text,
 enabled boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE webhook_deliveries (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 webhook_id bigint NOT NULL REFERENCES webhooks(id),
 event_key text NOT NULL,
 payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','delivered','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(webhook_id,event_key)
);
