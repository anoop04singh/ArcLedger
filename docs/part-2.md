# Part 2 — raw ingestion and database

Part 3 adds the continuous ledger worker and replaces earlier API paths. Use [the current API contract](api.md) and [Part 3 runbook](part-3.md) when running the latest code.

The worker captures Arc Mainnet data before normalization. It stores every committed block, transaction, receipt and log, including unrelated emitters, zero-topic logs, failed transactions and contract creations. Provider-specific payload fields are retained in JSONB. Original JSON-RPC quantities remain hexadecimal strings in the raw payloads; searchable scalar quantities are exact PostgreSQL numeric(78,0).

## Run locally

```sh
# Copy .env.example to .env and set ARCLEDGER_MODE=mainnet.
docker compose up -d
npm run db:migrate
npm run dev:indexer
# Separate terminal for the existing API/UI:
npm run dev
```

Set `INDEX_START_BLOCK=190000` for a specific backfill. Leave it empty to begin at the current committed head. A stored checkpoint always takes precedence over this environment setting on restart. The older `INDEXER_START_BLOCK` and `ARC_RPC_URL` names remain accepted as compatibility aliases, with the new names taking precedence.

`PRIMARY_RPC_URL` defaults to Circle's Mainnet endpoint and `FALLBACK_RPC_URL` to the documented dRPC Mainnet endpoint. An explicitly empty fallback disables failover. Both endpoints are checked for chain ID 5042 before their responses can be used. Each request tries primary first, then fallback on errors or missing results. This is not a load balancer. Use your own provider credentials/endpoints when public rate limits prevent sustained ingestion; do not commit credential-bearing URLs.

Defaults: 250 ms polling when caught up, four prefetched blocks, 32 concurrent transaction pairs per block, and small HTTP JSON-RPC batches of eight. Blocks commit in order. RPC requests have a four-second timeout; failures retry the same durable checkpoint with bounded exponential backoff (1–10 seconds). Backlog catch-up does not sleep between successful batches. Configure `INDEXER_BLOCK_PREFETCH`, `INDEXER_TX_CONCURRENCY`, `INDEXER_POLL_MS`, and `INDEXER_RETRY_MS` for your provider capacity.

## Exact RPC usage

- `eth_blockNumber`: current committed head, with no cached block-number result.
- `eth_getBlockByNumber`: raw block header and ordered transaction hashes.
- `eth_getTransactionByHash`: complete original transaction objects.
- `eth_getTransactionReceipt`: original receipts, execution outcome and gas quantities.
- `eth_getLogs`: unfiltered logs for each block, cross-checked against the complete receipt log set.
- `eth_getBalance`: block-pinned native USDC balance through the API's shared failover client.

No confirmation count, delayed safe-block offset, or chain rollback is used. Committed hash conflicts stop processing as data-integrity errors. Temporary RPC inconsistencies retry without saving the block. Block number and transaction/log indices establish ordering; timestamps need not be unique.

## Tables and migration

`schema_migrations` versions the schema and serializes migrations under a database lock. Run the migration with a dedicated PostgreSQL connection. Both fresh databases and the unversioned Part 1 schema are supported atomically.

| Table              | Purpose                                                                                                                                  |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| blocks             | Chain ID, number/hash, parent hash, timestamp, original block, processed_at, raw_complete                                                |
| transactions       | Chain ID/hash, block/index, sender/recipient, native value, status, gas quantities, fee_raw, timestamp, original transaction and receipt |
| raw_events         | Chain/block/transaction identity and ordering, emitter, topic0, complete topics/data, original log, timestamp                            |
| transfers          | Existing canonical read model, populated only by downstream normalization                                                                |
| address_entries    | Optional derived received/sent/fee entries                                                                                               |
| indexer_state      | Per-chain last_processed_block, start/raw coverage, observed head, heartbeat                                                             |
| webhooks           | Reserved and disabled by default; no delivery worker                                                                                     |
| webhook_deliveries | Reserved with unique webhook/event delivery key                                                                                          |

Required `(chain_id, block_number)`, `(chain_id, tx_hash)` and `(chain_id, transaction_hash, log_index)` uniqueness constraints are enforced. The MVP is still Arc-only. Legacy single-chain primary keys are retained to preserve relationships during migration.

The migration renames Part 1 fields in place and preserves existing canonical explanations. Legacy records have `raw_complete=false` and null raw payloads: missing historical bytes cannot be reconstructed from decoded evidence. `raw_start_block` marks the start of newly captured raw coverage. Restart resumes from the existing checkpoint rather than silently reindexing or deleting historical data.

## Atomicity and recovery

A PostgreSQL advisory lock permits one indexer writer. A dedicated connection commits the block, all transactions, all raw events, completeness checks and checkpoint in one transaction. Exact replays are no-ops. A database error rolls back the entire block; the worker releases/reconnects, reacquires the lock and rereads its checkpoint. If COMMIT succeeded but its acknowledgement was lost, rereading the checkpoint prevents duplicate processing. SIGINT/SIGTERM stop at a block boundary; any fetched but uncommitted blocks are safely fetched again.

Gas is stored as `gas_used * effective_gas_price`, an exact native-USDC base-unit integer. Failed transactions retain their fee. No fee is labeled as another asset.

## Auditing and Part 1 compatibility

`GET /v1/transactions/:hash/raw` returns the original transaction, receipt and logs. Unknown or legacy-only raw records return 404. The regular explain endpoint returns 409 when the raw transaction exists but normalization is pending, including the raw endpoint path. `/v1/status` adds raw transaction/event counts, pending normalization and raw coverage start. Address and status pages identify incomplete normalized totals.

Raw ingestion never runs the normalizer. To populate the existing Part 1 canonical UI read model, run `npm run project:once` separately (up to 100 pending transactions per invocation). This optional downstream step writes transfers/address entries and explanations; parsing failures are recorded without altering raw records or the ingestion checkpoint. A later normalization stage can rebuild these projections from retained evidence. To retry a rejected projection after a parser fix, clear its `projection_error` in a controlled local database maintenance operation, then rerun the projection command.

## Local checks

```sh
npm test
npm run typecheck
npm run build
npm run test:mainnet
```

By default, the live smoke uses a separate persistent PGlite database under `.local/part2-*/postgres`. It captures recent Mainnet blocks, shuts down/reopens that database, verifies checkpoint persistence, replays a block, and runs a timed continuous ingestion phase with independent head/lag sampling. It never writes to `DATABASE_URL` or submits transactions. `SMOKE_DURATION_MS` controls the timed phase. Reports are saved to `.local/part2-latest.json` and alongside each test database. The report distinguishes observed lag from a throughput guarantee: public provider performance varies.

## Arc MCP sources

Confirmed through Arc MCP on 2026-09-17/18:

- https://docs.arc.io/arc/references/evm-differences — finality on inclusion.
- https://docs.arc.io/integrate/infrastructure/indexing-events — immutable blocks and index ordering.
- https://docs.arc.io/arc/references/rpc-endpoints — methods and primary/fallback endpoints.

No deployment or GitHub push is part of this stage.

For native PostgreSQL, set `SMOKE_DATABASE_URL` to a localhost test server. The smoke creates an isolated schema and reconnects to verify persisted checkpoints; it does not stop the server or use `DATABASE_URL`. The schema is retained for inspection.

The verified low-lag profile used `PRIMARY_RPC_URL=https://rpc.drpc.mainnet.arc.io`, `FALLBACK_RPC_URL=https://rpc.blockdaemon.mainnet.arc.io`, 250 ms polling and transaction concurrency 32. The native PostgreSQL run achieved median lag 1 block and p95 lag 2 blocks. Circle's public endpoint was rate-limited during another run; provider capacity directly affects lag. See [verification results](testing.md#part-2-verification).
