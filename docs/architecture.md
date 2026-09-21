# Architecture — complete MVP

Arc Mainnet committed blocks -> raw capture -> PostgreSQL -> separate canonical projection -> Hono API -> Next.js.

The raw ingestor has no dependency on normalization decisions. Blocks, complete original transaction/receipt JSON, and logs from every emitter are persisted before a separate projection can classify or match evidence. Failure to parse an event never discards the source record.

## Ingestion

`eth_blockNumber` supplies the committed head. Arc finality is deterministic on inclusion, so there is no confirmation offset or reorg rollback. A bounded group of blocks is fetched concurrently; their database commits remain ordered. Transaction/receipt metadata is cross-checked against the block, and `eth_getLogs` must agree with receipt logs. Missing or inconsistent RPC responses retry the block. Committed hash/parent conflicts stop the worker for investigation.

Each RPC request tries primary and then fallback. Both endpoints are chain-verified. Small JSON-RPC batches avoid provider limits without adding a load balancer. A dedicated PostgreSQL session holds the writer advisory lock; each block, its raw records and its checkpoint share one transaction. Idempotent replay, reconnect/resume after transient failures, and graceful shutdown preserve a contiguous indexed range.

Versioned migrations upgrade the original Part 1 schema in place. Existing normalized data is preserved. Historical raw data absent from the old schema is explicitly unavailable. See [Part 2](part-2.md) for tables, constraints, configuration and restart behavior.

## Accounting and presentation

The continuous `dev:ledger` worker (or bounded `project:once` command) uses the reusable normalizer to populate transfers, address entries and explanations. It is a downstream operation, outside the raw indexer transaction. Exact values use BigInt and numeric(78,0); raw RPC hex quantities are also retained. Parsing failures leave raw records untouched and appear as pending/error status.

The four read-only APIs expose status, address summaries, cursor-paginated ledger entries and transaction explanation. `/v1/tx/:txHash?includeRaw=true` retains audit access. The canonical explain route returns a clear pending response until the projection exists. Address totals/history and status show whether normalization is behind raw capture. Current balance comes from a separate block-pinned RPC request through the same failover mechanism.

## Limits

Public RPC throughput varies; measured head lag is an operational metric, not a guarantee. Historical balance reconciliation still needs to account for non-event state changes such as validator rewards. Materialized aggregate counters, long-term retention policies and additional throughput tuning can follow once needed. Webhook tables are reserved and have no active delivery worker.

No authentication, billing, multichain routing, queues or complex analytics infrastructure are introduced. Railway deployment assets are provided for user-operated publishing. DemoStore remains an explicit synthetic source and never substitutes for a failed Mainnet service.

Arc MCP sources:

- https://docs.arc.io/arc/references/usdc-system-events
- https://docs.arc.io/integrate/infrastructure/indexing-events
- https://docs.arc.io/arc/references/evm-differences
- https://docs.arc.io/arc/references/rpc-endpoints

Part 3 adds atomic versioned ledger projections, once-per-sender fee allocation, sequence-bounded keyset pagination, fresh RPC health/balance reads, and bounded per-IP/aggregate rate limits. See [ledger rules](part-3.md) and the [API contract](api.md).

Part 4 centralizes verified TLS PostgreSQL connections for Supabase Session Pooler/direct connections, without changing the schema. All browser reads go through the backend; cursor load-more uses a fixed same-origin relay. The status endpoint performs a database health probe. See [Supabase setup](part-4.md).

## Validation and production processes

The validator fetches fresh committed blocks through the same chain-checked RPC transport, then reads a repeatable-read database snapshot. Its independent ABI decoder and ledger arithmetic oracle compare retained records, one-to-one evidence matching, canonical rows and per-address fees/net changes. It does not invoke the normalization engine to generate expected results. Runs are persisted with explicit bounds; interrupted/provider-error runs do not claim a zero mismatch result.

Deploy four persistent processes: Next.js web, Hono API, raw indexer, and ledger projector. Supabase remains the shared database. Web has only a server-side API URL; backend credentials never enter its client bundle. The root Dockerfile and [Railway runbook](railway.md) describe root-workspace builds, commands, TLS, networking and verification. No automatic deployment is performed.
