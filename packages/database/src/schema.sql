CREATE TABLE IF NOT EXISTS blocks (
  number numeric(78,0) PRIMARY KEY CHECK (number >= 0),
  hash text NOT NULL UNIQUE,
  parent_hash text NOT NULL,
  timestamp timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS transactions (
  hash text PRIMARY KEY,
  block_number numeric(78,0) NOT NULL REFERENCES blocks(number),
  sender text NOT NULL,
  fee numeric(78,0) NOT NULL CHECK (fee >= 0),
  explanation jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS transactions_sender ON transactions(sender, block_number DESC);
CREATE TABLE IF NOT EXISTS movements (
  id text PRIMARY KEY,
  transaction_hash text NOT NULL REFERENCES transactions(hash),
  from_address text NOT NULL,
  to_address text NOT NULL,
  amount numeric(78,0) NOT NULL CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS movements_from ON movements(from_address);
CREATE INDEX IF NOT EXISTS movements_to ON movements(to_address);
CREATE TABLE IF NOT EXISTS indexer_state (
  id integer PRIMARY KEY CHECK (id = 1),
  start_block numeric(78,0) NOT NULL,
  latest_block numeric(78,0) NOT NULL,
  finalized_head numeric(78,0) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
