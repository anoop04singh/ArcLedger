# ArcLedger

**One dollar. One ledger.** The accounting layer for Arc USDC.

Part 1 foundation: a local-first TypeScript monorepo with an Arc accounting adapter, exact normalization, PostgreSQL persistence, finalized-block ingestion, a read-only HTTP API, and a Next.js UI. This repository has not been deployed or published.

## Run locally

Requires Node.js 22.16+ and npm. From the repository root:

```sh
npm install
# Copy .env.example to .env (PowerShell: Copy-Item .env.example .env)
npm run dev
```

Open http://127.0.0.1:3000. The API listens on http://127.0.0.1:3001. The default is explicitly labeled **demo mode**, with three synthetic transactions and no external dependencies. The sample links on the landing page open an address or a transaction. Unknown addresses have empty sample history and no fabricated balance.

## Mainnet configuration

1. Start local PostgreSQL: `docker compose up -d`.
2. Copy `.env.example` to `.env` and set `ARCLEDGER_MODE=mainnet`.
3. Set `ARC_RPC_URL` and `DATABASE_URL`. Choose `INDEXER_START_BLOCK` deliberately; zero starts from genesis and can take a long time with the sequential foundation indexer.
4. Run `npm run check:rpc` to confirm Mainnet chain ID and finalized-block access.
5. Run `npm run db:migrate`.
6. In separate terminals run `npm run dev:indexer` and `npm run dev`.

The API checks the RPC chain ID before serving Mainnet data. The indexer only processes finalized blocks and stops on conflicting hashes, malformed evidence, or failed RPC/database calls. Restart it after resolving the fault; it resumes at the atomically committed checkpoint. There is no automatic demo fallback in Mainnet mode. Services bind to loopback for local use.

For a production-mode local UI: `npm run build`, then run the API (`npm run start -w @arcledger/api`) and web (`npm run start -w @arcledger/web`) separately. `API_URL` can be set in the shell when using a non-default API location. No deployment scripts or hosted services are configured.

## Checks

```sh
npm test
npm run typecheck
npm run build
# With npm run dev running, and a Playwright Chromium installed:
npm run test:ui
```

Database integration tests execute the PostgreSQL schema and SQL against PGlite (embedded PostgreSQL). Docker PostgreSQL remains the development service; a Docker daemon is not required for the test suite.

## Structure

- `apps/web`: Next.js, Tailwind, shadcn-style Button, Framer Motion, Lucide, locally bundled Geist fonts.
- `apps/api`: Hono read-only address, transaction explain, and status endpoints.
- `apps/indexer`: viem finalized block and receipt ingestion.
- `packages/normalizer`: strict parsing, native canonical movements, one-to-one duplicate matching, exact fees.
- `packages/database`: schema, atomic checkpointing, queries, and an explicit demo adapter.
- `packages/arc-config`: all Arc protocol/network constants, client construction, chain verification.
- `packages/types`: shared adapter, evidence, movement, and API contracts.
- `examples/node-client`: minimal read-only API example.

## Part 1 boundaries

This is the foundation for the five-part build, not a claim that the entire Mainnet MVP has passed validation. Mainnet balance reconciliation, validator reward accounting, throughput optimization, and operational hardening remain later work. The status API returns `accountingMismatches: null` and `validation: not-run` until real reconciliation is implemented. Indexed-period totals are not lifetime totals. Current balance comes from a separate finalized-block RPC snapshot and may be ahead of indexed coverage.

Native system Transfer evidence is authoritative; unmatched ERC-20 logs remain visible as warnings and do not create invented movements. Matching repeated equal transfers is deterministic by log order and proves a multiset match, not a call-trace association.

See [architecture](docs/architecture.md), [normalization](docs/normalization.md), [API](docs/api.md), [Part 1 checklist](docs/part-1.md), and [UI design](design.md).

Local verification results: [testing report](docs/testing.md). Run the bounded live read-only smoke with `npm run test:mainnet`. License: MIT.
