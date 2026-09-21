# ArcLedger

**The accounting layer for Arc USDC.** Normalize native transfers, ERC-20 activity and gas into one canonical ledger.

Arc exposes one USDC balance through an 18-decimal native representation and a 6-decimal ERC-20 interface. Counting both Transfer streams doubles economic activity. ArcLedger retains raw evidence, matches representations one-to-one, counts native movements once, and accounts for receipt-derived gas fees separately. ERC-20 self transfers retain a zero-balance-change audit record.

The five-part MVP includes raw ingestion, Supabase/PostgreSQL persistence, a reusable normalizer, exact address accounting, four public read APIs, an explorer UI, independent Mainnet validation, and Railway deployment assets. Published to [GitHub](https://github.com/anoop04singh/ArcLedger) and deployed on Railway. Open the [website](https://web-production-e1571d.up.railway.app) or [live explorer](https://web-production-e1571d.up.railway.app/explorer). The explorer reports actual indexed coverage and lag; deployment does not imply the historical backlog is caught up.

## Architecture

```text
Arc Mainnet RPC → raw indexer → Supabase PostgreSQL
                                      ↑       ↓
                              ledger projector
                                      ↓
                               Hono API → Next.js web

Fresh Arc RPC + stored snapshot → independent validator → validation_runs
```

Raw data and its checkpoint commit together. Normalization is a separate atomic projection; parser failures never discard raw records. Values use BigInt/numeric(78,0), with exact decimal strings in public APIs. Current balances come from block-pinned eth_getBalance; history covers the indexed range.

## Local demo

Requires Node.js 22.16+ and npm:

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3000 (API: http://127.0.0.1:3001). With no .env, explicitly labeled demo data needs no database. An existing .env selecting Mainnet continues to use Mainnet.

## Mainnet and Supabase

Copy .env.example to the git-ignored .env and configure:

```ini
ARCLEDGER_MODE=mainnet
DATABASE_URL=<Supabase Session Pooler URL, port 5432>
DATABASE_SSL_CA_FILE=<absolute path to downloaded Supabase CA>
PRIMARY_RPC_URL=<Arc Mainnet provider>
FALLBACK_RPC_URL=<independent Arc Mainnet provider>
API_URL=http://127.0.0.1:3001
```

Remote PostgreSQL verifies TLS. Transaction Pooler port 6543 is unsupported. Railway can use DATABASE_SSL_CA containing multiline PEM instead of a local certificate path. No Supabase API key is required. Never put database/private RPC credentials in NEXT_PUBLIC_* variables.

```sh
npm run check:database
npm run db:migrate
npm run check:rpc
npm run dev:indexer
# Separate terminal: required canonical projection worker
npm run dev:ledger
# Separate terminal: API and web
npm run dev
```

For local PostgreSQL instead, use `docker compose up -d` and the example localhost connection. Supabase users do not need Docker.

INDEX_START_BLOCK selects the initial backfill block; unset it to begin at the current committed head. A persisted checkpoint always wins on restart. Arc blocks are final on inclusion; incomplete RPC results retry without advancing the checkpoint. Run one raw worker and one ledger worker. `project:once` processes up to 100 pending transactions for bounded checks.

## Read API

| Endpoint                                            | Purpose                                                 |
| --------------------------------------------------- | ------------------------------------------------------- |
| GET /v1/status                                      | Database/RPC health, head, lag, coverage and validation |
| GET /v1/address/:address                            | RPC balance and indexed received/sent/fee totals        |
| GET /v1/address/:address/ledger?limit=50&cursor=... | Stable cursor-paginated address entries                 |
| GET /v1/tx/:txHash                                  | Canonical movements, fee and matching evidence          |

Add `?includeRaw=true` to the transaction endpoint for retained transaction/receipt/log payloads. Public reads have bounded rate limits and no accounts/API keys. See [API details](docs/api.md).

## Tests and validation

```sh
npm test
npm run build
# Demo API/web running, with Playwright Chromium installed:
npm run test:ui
# Configured Supabase with indexed and projected blocks:
npm run validate:mainnet
```

The validator defaults to the latest five stored raw blocks. VALIDATION_START_BLOCK and VALIDATION_END_BLOCK select 1–1000 contiguous blocks. It independently decodes freshly fetched RPC logs, compares raw/canonical records and exact 18/6 matching, and checks receipt fees and address net changes. Results persist in validation_runs and .local/mainnet-validation.json. It prints VALID/INVALID/ERROR and exits nonzero on failure. Empty samples and pending projections cannot pass.

`/validation` shows actual sample bounds and completion time. Zero mismatches means no failed checks **in that sample**, not lifetime reconciliation or certification of later blocks. Validator rewards and other non-event balance changes remain outside this scope.

Tests cover native/dual events, precision/dust, repeated participants, self transfers, relayer/failed-transaction fees, pagination, replay, interrupted writes, restart and lost commit acknowledgements. `test:mainnet` and `test:ledger:mainnet` use isolated local databases; `verify:database` tests bounded ingestion/restart against the configured database. See [test evidence](docs/testing.md).

## Deploy yourself to Railway

Follow the [Railway runbook](docs/railway.md): four root-workspace services (web, api, indexer, ledger), one Dockerfile, Supabase Session Pooler, verified TLS, private API networking and public domains. Exact commands and variables are provided. Web requires only API_URL, never database credentials. No deployment is performed by this repository's build/test commands.

## Scope and documentation

No smart contract is required. Webhook tables remain reserved and unused. Authentication, billing, multichain support, tax reporting and analytics are outside this MVP. Demo data never substitutes for a failed Mainnet connection.

Read [architecture](docs/architecture.md), [normalization](docs/normalization.md), [API](docs/api.md), [Part 5 validation/demo](docs/part-5.md), [Railway](docs/railway.md), and the earlier [ingestion](docs/part-2.md), [ledger](docs/part-3.md), [Supabase](docs/part-4.md) runbooks.

MIT licensed.

## Rolling history: 400 MB database budget

This deployment is **a recent-history ledger, not an archival indexer**. Its database budget is **400,000,000 bytes (400 decimal MB)** to leave headroom under the Supabase Free database allowance. Both Mainnet workers enforce the policy automatically; no extra scheduler is required.

- Before each new block, the indexer measures `pg_database_size(current_database())`, including tables, indexes, TOAST and other database objects. It reserves at least 16 MB (or 12× the incoming JSON size) for raw writes and downstream accounting. Oversized blocks pause ingestion rather than bypassing the limit.
- Cleanup starts conservatively when measured size plus the reservation reaches **300 MB**. It aims for **220 MB including the reservation**, rather than filling the entire allowance. The ledger worker waits near the cleanup threshold and projects bounded batches of 20 transactions.
- Oldest blocks expire first. Their raw logs, receipts, transactions, transfers and address entries are deleted **together in one transaction**. The latest committed block and ingestion checkpoint remain, so the next block still verifies its parent and resumes normally. A retained block is never partially discarded.
- The indexer holds the raw writer lock and the projection lock during maintenance. `VACUUM FULL` then physically compacts the affected tables/indexes. Ordinary DELETE/VACUUM does not reliably shrink allocated database size. Compaction can temporarily block database-backed reads and needs temporary disk space; it is deliberately started below the budget.
- Interrupted compaction is recorded and retried before more history is removed. If the remaining data, unrelated database objects, permissions, or an oversized block prevent safe reclamation, ingestion **pauses with its checkpoint intact** instead of continuing to fill storage.
- Retained coverage moves forward in `/v1/status`, the explorer, and address pages. Received/sent/fees/transaction counts describe **retained history only**, never lifetime totals. Current balances still use Arc RPC. Pruned transaction hashes return 404; pagination cannot recover expired entries, so reload history if the window moves while browsing.
- Validation reports whose sample overlaps pruned history expire too, avoiding a misleading VALID badge for missing evidence. Run a fresh validation against retained, fully normalized blocks.

The 400 MB value is an application storage budget, not a PostgreSQL disk quota: WAL, temporary compaction files, provider accounting delays, or external writes are outside the indexer's byte accounting. The 300/220 MB operating thresholds leave room for these effects. Do not put unrelated large datasets in this database or disable retention. Deletion is permanent; export needed history before it expires.

If a database is already over quota and read-only, stop both writers first. Use Supabase's [documented maintenance-session procedure](https://supabase.com/docs/guides/platform/database-size#disabling-read-only-mode) to allow cleanup, migrate, prune and compact; verify size before restarting. Do not enable normal ingestion as a workaround for the quota. See [Railway operations](docs/railway.md).

## Landing and explorer interactions

The landing page explains the two USDC representations, matching, receipt-derived fees, validation scope and the rolling history window. It includes a scroll-driven SVG stream merge, a 2×→1× illustrative counter, text reveals, magnetic/rolling buttons, an interactive normalization card, API examples with copy controls, a pausable use-case ticker, install commands and a keyboard-accessible FAQ. Animations use the free `motion/react` APIs and respect reduced-motion preferences. The explorer uses real status/recent-transaction responses, 15-second refresh, pause/resume, filters, explicit failure states, a loading skeleton and the storage/coverage notice.
