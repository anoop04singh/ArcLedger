# Architecture

Arc Mainnet -> finalized blocks + every transaction receipt -> ArcAccountingAdapter -> PostgreSQL -> Hono API -> Next.js.

The packages separate chain facts, data contracts, accounting rules, persistence, and presentation. No wallet, authentication, billing, multichain routing, queues, or analytics infrastructure is introduced.

## Ingestion guarantees

Only `finalized` block ranges are processed. Each receipt must belong to the fetched block. All receipts are included, even reverted or zero-transfer transactions, because gas is an economic cost. Receipt gas is attributed to the transaction sender; transfer attribution comes from event participants, including relayed activity.

A dedicated PostgreSQL connection holds a session advisory lock, allowing one writer. A block, raw decoded evidence, canonical movements, and its checkpoint commit in one transaction. The cursor only advances after commit. Primary keys make identical block replays idempotent. Parent hash conflicts and non-contiguous ingestion stop processing rather than silently overwriting finalized history. RPC requests have bounded retries and timeouts. Persistent failures terminate the worker so its heartbeat becomes stale.

`numeric(78,0)` stores native uint256-sized values. JSONB explanations retain raw amounts, precision, matching disposition, and evidence indices. No floating-point amount arithmetic is used. PostgreSQL indexes support address and transaction lookup; address totals cover stored history only.

## Local and live separation

DemoStore is an explicit synthetic fixture source. Mainnet mode requires DATABASE_URL and a verified Arc RPC. Missing services yield unavailable responses, never substituted sample data. The status page does not claim a successful accounting reconciliation. Live means the persisted cursor has caught up to its observed finalized head and the worker heartbeat is recent; it is not an independent RPC health certification.

## Known foundation limitations

Sequential receipt fetching prioritizes correctness over throughput; provider-specific batched receipt ingestion can follow. No automatic fork rollback is implemented because this stage only accepts finalized blocks; conflicts require investigation. Migration is additive/idempotent schema initialization, not a full versioned migration framework. Balance reconciliation must account for non-event state changes such as validator rewards before it can certify address deltas. Offsetting history pagination can shift while new blocks are inserted; a snapshot/cursor API is a later enhancement. Counts and historical totals are calculated on demand and will need materialized aggregates at large scale.

Arc documentation was read through Arc MCP on 2026-09-17:

- https://docs.arc.io/arc/references/usdc-system-events
- https://docs.arc.io/integrate/infrastructure/indexing-events
- https://docs.arc.io/arc/references/connect-to-arc
- https://docs.arc.io/arc/references/rpc-endpoints

Mainnet chain ID is 5042. Mainnet has used EIP-7708 system Transfer logs since genesis; pre-Zero5 testnet events are outside scope.
