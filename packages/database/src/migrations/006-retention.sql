CREATE TABLE retention_state (
 chain_id integer PRIMARY KEY,
 database_bytes bigint NOT NULL DEFAULT 0,
 cap_bytes bigint NOT NULL DEFAULT 400000000,
 needs_compaction boolean NOT NULL DEFAULT false,
 pruned_blocks bigint NOT NULL DEFAULT 0,
 pruned_through numeric(78,0),
 state text NOT NULL DEFAULT 'ready' CHECK(state IN ('ready','pruning','blocked')),
 checked_at timestamptz NOT NULL DEFAULT now()
);
