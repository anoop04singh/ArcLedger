# ArcLedger

**The accounting layer for Arc USDC.** Normalize native transfers, ERC-20 activity and gas into one canonical ledger.

Arc exposes one USDC balance through an 18-decimal native representation and a 6-decimal ERC-20 interface. Counting both Transfer streams doubles economic activity. ArcLedger retains raw evidence, matches representations one-to-one, counts native movements once, and accounts for receipt-derived gas fees separately. ERC-20 self transfers retain a zero-balance-change audit record.

The five-part MVP includes raw ingestion, Supabase/PostgreSQL persistence, a reusable normalizer, exact address accounting, four public read APIs, an explorer UI, independent Mainnet validation, and Railway deployment assets. **GitHub publication and deployment are user-operated and have not been performed.**

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
