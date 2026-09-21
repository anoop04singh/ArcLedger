# Part 1 local verification

Verified on 2026-09-17. No repository publication or deployment was performed.

| Check                                        | Result                            |
| -------------------------------------------- | --------------------------------- |
| TypeScript, services and Next.js             | Passed                            |
| Normalizer/API/PostgreSQL integration        | 21 tests passed                   |
| Production Next.js build                     | Passed, all four routes generated |
| Chromium desktop/mobile flows                | 2 tests passed                    |
| npm dependency audit                         | 0 vulnerabilities                 |
| Arc Mainnet RPC chain ID and finalized block | Passed                            |
| Bounded live ingestion smoke                 | Passed, details below             |

Browser checks cover invalid search input, address search, history navigation, canonical evidence, explicit demo status, unknown transactions/addresses, and horizontal overflow on all four pages at 390px. Desktop landing and mobile address/transaction/status screenshots were visually reviewed. Screenshots are local artifacts under `.local/` (ignored by Git).

The first browser run encountered cold Next.js compilation and an overly broad alert selector that also matched Next.js's route announcer. The final suite waits for entrance animations, targets the actual search error, and passes. Development and production output directories are separate to avoid local build collisions.

## Live read-only Mainnet smoke

At 2026-09-17T13:43:40.859Z, five finalized Arc Mainnet blocks **21,336,585–21,336,589** were read and processed through the shared real ingestion function, normalizer, PostgreSQL schema/queries, and Hono status API. The temporary database used PGlite (embedded PostgreSQL).

- 154 transaction receipts processed.
- 202 canonical economic movements stored.
- 84 duplicate ERC-20 representations matched and excluded from totals.
- 0 normalization warnings.
- Chain ID 5042 verified against RPC.

This confirms a small live ingestion sample, not complete Mainnet accounting. Historical balance reconciliation and validator-reward accounting remain unimplemented and are correctly marked not-run. No chain transactions were signed or submitted.

Run the smoke again with `npm run test:mainnet`. It reads five recent finalized blocks and writes its report to `.local/mainnet-smoke.json`. It does not persist to the configured production database.

## Environment limits

Docker was installed but its daemon was not available, so a Docker PostgreSQL service was not started. PostgreSQL SQL behavior and transactional rollback were tested using PGlite. Deployment readiness, external hosting, and long-running Mainnet indexing are outside this local Part 1 verification.

## Part 2 verification

Part 2 supersedes the earlier smoke command above. `npm run test:mainnet` now tests raw ingestion, durable checkpoints, replay and a timed indexing phase, retaining reports under `.local/part2-*`.

- 31 tests pass across normalizer, API, raw storage/migration, RPC ingestion and worker recovery.
- Recovery cases include partial-write rollback, RPC failure, duplicate replay, restart, lost COMMIT acknowledgement, and migration of the Part 1 schema without losing existing explanations.
- TypeScript and the production Next.js build pass. The web bundler now resolves ESM `.js` imports to workspace TypeScript sources.
- Raw transaction/receipt/provider fields and unfiltered logs remain available through the audit API. Exact fee arithmetic, pending-normalization responses and parser-failure isolation are tested.

### Native PostgreSQL Mainnet benchmark

At `2026-09-17T18:49:17.039Z`, a 60-second timed run (plus initial restart/replay phase) against local PostgreSQL 18.4 stored **125 blocks, 2,555 transactions and 7,240 raw events**. Primary dRPC and fallback Blockdaemon were used, with 250 ms polling, four prefetched blocks and 32 concurrent transaction pairs. These concurrency/polling settings are the current defaults.

- Median sampled lag: **1 block**; p95: **2 blocks**; maximum: **3 blocks**.
- 97% of 75 post-warmup samples were within two blocks of an independently fetched head.
- 0 worker retries and 0 RPC failovers.
- Checkpoint before/after reconnect: **21,372,630**. Replaying the committed block did not duplicate rows.
- Final checkpoint: **21,372,750**; observed head: **21,372,751**.
- Detailed local report: `.local/part2-1789670894209/report.json`.

A separate persistent PGlite run stored 143 blocks, 3,492 transactions and 11,819 raw events, with median lag 2 and p95 4 at the earlier 750 ms/16-pair settings. An earlier Circle-primary run encountered public RPC rate limits and sustained higher lag. The 1–2 block target is demonstrated with the tested provider configuration, not guaranteed for every provider or workload.

The final reusable `SMOKE_DATABASE_URL` command was also verified on `2026-09-18T19:39:47.840Z`: 16 blocks, 109 transactions, 384 raw events, preserved checkpoint 21,549,076, no retries/failovers. That five-second run is a command/recovery check, not a meaningful long-duration latency benchmark.

Temporary native PostgreSQL was bound to localhost on port 55432 with an isolated generated schema. Test data and reports are retained under ignored `.local/`. No blockchain writes, GitHub push or deployment occurred. Long-duration uptime, full balance reconciliation and webhook delivery remain outside Part 2.

Final browser regression: **2/2 desktop and mobile flows pass**. The first attempt exceeded a five-second assertion while Next.js compiled a route; assertions now allow 15 seconds for local cold compilation. The temporary PostgreSQL server has been stopped; its data remains available locally for inspection.

## Part 3 verification

Verified locally on 2026-09-19. The suite now has **43 passing tests** across six files. New checks cover exact gross/net changes, once-only sender fee allocation, relayers, reverted/fee-only/self transactions, mint/burn, sub-six-decimal precision, cursor scope/validation, same-transaction pagination boundaries, snapshot stability under new blocks and late projections, projection rollback/retry, legacy entry rebuilding, RPC balances, status freshness, and rate-limit reset/header spoof resistance.

Both desktop/mobile browser flows passed against the four new core endpoints. The mobile address screenshot was visually reviewed: balances, fees and net changes fit the light glass UI without horizontal overflow. Production build and TypeScript checks pass. No deployment or GitHub push was performed.

### Live ledger/API check

At `2026-09-19T08:43:58.327Z`, the Part 3 smoke used native PostgreSQL with an isolated local schema and read blocks **21,641,806–21,641,810** through the same raw ingestor:

- **62 transactions**, **449 raw events**, **111 canonical transfers**, **270 address entries**.
- **81 duplicate representations matched**, zero normalization warnings or pending projections.
- Receipt fee total and ledger fee total both equaled **324972678497556895 native base units** (0.324972678497556895 USDC).
- Zero entries violated `netChange = grossChange - fee`.
- Cursor traversal returned each sampled address entry once; projection replay wrote no additional rows.
- Transaction explanation fee equaled the original receipt's `gasUsed * effectiveGasPrice`.
- The sampled current balance **64.218278700625619124 USDC** at block **21,641,835** matched an independent `eth_getBalance` read at the same block.

The report is retained at `.local/part3-latest.json`, with the full run under `.local/part3-*`. This bounded five-block sample intentionally stops indexing, so `/v1/status` correctly reported degraded as the live chain advanced. It does not measure continuous indexer lag or certify full historical balance reconciliation. The temporary local PostgreSQL server was stopped after verification; its data remains available for inspection.

## Part 4 verification

Verified on **2026-09-20** against the user-configured Supabase Session Pooler (5432) with TLS certificate/hostname verification and the user-provided server CA. No application deployment or GitHub push was performed.

- **47 unit/integration tests pass** across seven files, including database health, rejection of transaction pooling, verified TLS configuration, browser-role permission revocation and existing accounting/recovery behavior.
- **4 demo browser tests pass**: search/navigation, desktop/mobile layout, append-style cursor loading with error/retry, and normalization/database metadata.
- TypeScript and production Next.js build pass, including the read-only same-origin pagination relay.
- Real Supabase-backed address, transaction and status pages passed desktop and 390px mobile checks with no browser errors. Screenshots are `.local/part4-mainnet-*.png`; browser report `.local/part4-mainnet-ui.json`.
- The production browser assets (26 files) contain none of the configured database URL/password or Supabase secret key values. `.env` is ignored by Git.
- Actual Supabase privilege checks confirm `anon` and `authenticated` have no SELECT/INSERT/UPDATE/DELETE access to ArcLedger's tables. Migrations revoke those grants without changing the Parts 2–3 table definitions.

### Supabase persistence and restart proof

The first run committed blocks **21,865,109–21,865,110**, closed the worker session, and resumed at **21,865,111–21,865,112**. All 41 captured transactions projected successfully. API status read from Supabase reported `database: healthy`.

The finalized verification command then committed **21,865,113–21,865,114**, restarted, and continued at **21,865,115–21,865,116**, projecting another 61 transactions. The saved report at `2026-09-20T16:18:27.511Z` confirms:

| Table              | Rows |
| ------------------ | ---: |
| blocks             |    8 |
| transactions       |  102 |
| raw_events         |  512 |
| transfers          |  124 |
| address_entries    |  315 |
| indexer_state      |    1 |
| webhooks           |    0 |
| webhook_deliveries |    0 |

There were 47 duplicate representations matched, zero normalization warnings and zero pending projections. Report: `.local/part4-database-verification.json`. Supabase data is retained. These were bounded verification runs, not continuous lag measurements: indexer state correctly becomes stale after the worker exits. Run `dev:indexer` and `dev:ledger` for ongoing indexing. The local API/UI preview is in Mainnet mode and uses Supabase.

Accounting reconciliation remains explicitly not-run, and optional webhook delivery was not implemented.

## Part 5 verification — 2026-09-21

- **65 unit/integration tests pass** across eight files. Added independent validation corruption checks, ERC-20-only self-transfer persistence, exact replay of raw/canonical tables, and stopping during an in-flight fetch followed by gap-free restart. Existing interrupted-write and lost-COMMIT-acknowledgement cases remain passing.
- **4/4 production demo browser tests pass**, including desktop search/explain, mobile layout across all five pages, pagination retry and explicit health states. Tests wait for streamed loading placeholders correctly. Browser testing found and fixed mobile overflow from long health labels.
- Production build and all TypeScript checks pass. An initial OneDrive-generated-cache readlink error was resolved by clearing only the generated Next.js cache.
- The real Supabase-backed production UI passed validation/transaction/address checks at 1440px and 390px, with zero page errors. It accurately labels the real transaction containing native transfers plus an ERC-20-only self record.
- **Mainnet range 21,865,109–21,865,116:** 8 blocks, 102 transactions, 512 raw logs from all emitters, 172 USDC records, 125 canonical records, 47 duplicate representations, **0 fee mismatches and 0 other accounting mismatches**. Independently fetched and checked at 2026-09-21 04:26 UTC. Scope is the sampled records and ledger arithmetic, not lifetime balances/rewards or later blocks.
- The first independent validation caught an ERC-20-only self transfer. Arc MCP docs confirmed native self calls emit no system event. The corrected parser retains one zero-gross-change self record. The initial invalid run remains recorded; the latest eight-block run is valid.
- Replaying Supabase block 21,865,116 twice left blocks, transactions, raw_events, transfers, address_entries and indexer_state unchanged. Report: `.local/part5-replay.json`.
- `anon` and `authenticated` have no direct read/write access to the new validation table. Verified TLS remains enabled. The 27 production client assets contained none of the configured backend secret values.
- Local reports: `.local/mainnet-validation.json`, `.local/part5-browser.json`; screenshots `.local/part5-*.png`. These are ignored by Git; portable sample evidence is in [Part 5](part-5.md).
- Root Dockerfile and [Railway instructions](railway.md) are supplied. Docker execution could not be checked because the local daemon was unavailable; production Node build/start processes were exercised directly. No GitHub push, blockchain transaction, contract deployment, Sites deployment, or Railway deployment occurred.

The Supabase sample is retained, and background indexing was deliberately stopped after bounded checks. A stale heartbeat/high lag in the local preview is truthful. Continuous production health and fresh validation must be checked after the user deploys and runs both workers.

## Landing and live explorer

The homepage explains normalization, fee accounting, evidence retention and use cases through a Motion-powered interactive example. `/explorer` provides search, current chain/indexed stats and the latest 12 normalized transactions. `GET /v1/status?includeRecent=true` adds this bounded feed without introducing a fifth core endpoint. The browser polls a same-origin server relay every 15 seconds, pauses in hidden tabs, supports manual pause/refresh, retains its last snapshot on errors and labels demo/backfill states explicitly.

Frontend regression checks: 66 unit/integration tests and five browser tests pass. The new interaction test covers illustrative self transfers, recent-feed filters, refreshed records and outage recovery. Live mode reads PostgreSQL/RPC; no synthetic transactions are inserted into Mainnet feeds.

## Retention and landing update (2026-09-21)

Four retention tests cover complete-block pruning, replay/restart continuity, rollback, unreclaimable storage protection, and recovery of a durable pruning plan after a later batch fails. The complete unit/integration suite contains 70 tests. Six browser scenarios cover the explorer plus landing copy, clipboard controls, API examples, FAQ keyboard interaction and reduced-motion mobile layout. Production Docker and local Next.js builds are checked independently. These tests do not certify Supabase quota behavior during a provider outage; that requires a successful live maintenance run and measured database size.
