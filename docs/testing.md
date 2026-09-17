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
