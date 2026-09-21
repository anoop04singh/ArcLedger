# Part 5 — validation and completion

## What changed

- Independent Mainnet validator: `npm run validate:mainnet`, with persisted sample metrics and explicit failure states.
- Public `/validation` page, also available through `/status`, showing actual database/RPC health and the latest checked range.
- Exact self-transfer accounting, including ERC-20 self records with no native event. Received/sent totals exclude them; any sender fee still applies once.
- Additional corruption, replay, stop/restart and fee tests; `npm run verify:replay` checks the configured database.
- Verified-TLS certificate environment variable, production start commands, root Dockerfile, and [Railway deployment runbook](railway.md).

## Mainnet evidence

At **2026-09-21 04:26 UTC**, fresh Arc Mainnet RPC records were compared with the configured Supabase database for **21,865,109–21,865,116**:

| Metric                            | Result |
| --------------------------------- | -----: |
| Blocks                            |      8 |
| Transactions                      |    102 |
| Raw logs, all emitters            |    512 |
| Raw USDC Transfer records         |    172 |
| Canonical records                 |    125 |
| Duplicate representations matched |     47 |
| Fee mismatches                    |      0 |
| Other accounting mismatches       |      0 |

The first validation found one ERC-20 self-transfer that had previously been excluded. Arc's [system-event reference](https://docs.arc.io/arc/references/usdc-system-events) confirms that self transfers emit no native log. The correction retains the ERC-20 record with zero gross change, without manufacturing a native event. Its real transaction is `0x9599376c19c778af8e6c381a463b1c4a37e9402b0b03a5cd4620fba42d5bfbe0`. The complete eight-block recheck passed. The initial invalid run remains in the database audit history; the page displays the latest run.

Migration 004 adds validation runs and queues raw records for self-transfer projection. Migration 005 targets ERC-20 self evidence. Both preserve raw data and checkpoints. The repeatable-read validator snapshot prevents a partially committed projection from being observed. Its expected records come from a separate ABI decoder and accounting oracle, not from calling the normalization engine again.

`verify:replay` replayed block **21,865,116** twice on Supabase and proved blocks, transactions, raw events, transfers, address entries and checkpoint unchanged. Earlier configured-Supabase restart checks resumed 21,865,113–114 → 21,865,115–116. New deterministic tests stop during a fetch; existing tests interrupt database writes and lose a commit acknowledgement, verifying rollback/reconnect without gaps or duplicates.

These are bounded tests, not an always-running hosted indexer. The worker is stopped after verification, so the local status correctly becomes **STALE** and lag increases. Run both indexer and ledger workers continuously after deployment. Full historical balance/validator-reward reconciliation and a sustained Railway lag benchmark are not claimed.

## Reproduce

```sh
npm ci
npm run db:migrate
# Run dev:indexer and dev:ledger until the desired sample is stored/projected.
# Stop the indexer before this lock-protected replay check:
npm run verify:replay
npm run validate:mainnet
npm test
npm run build
# Demo API and web running, with Chromium available:
npm run test:ui
```

Set `VALIDATION_START_BLOCK=21865109` and `VALIDATION_END_BLOCK=21865116` to reproduce this exact sample **in the existing database**. A fresh database must index that range first, or validate its own recent range. Remove overrides for the default latest-five-block check. Reports live under git-ignored `.local/`; portable findings are documented here without secrets.

## One-minute demo

1. Open the landing page and paste a real indexed transaction, for example `0x3a817259386484fafa1749192fb089cd53cf8b64ed2c28792bda0d6004450726` from this sample.
2. Show native 18-decimal and ERC-20 6-decimal raw records, their match, the single canonical result and the receipt-derived USDC fee.
3. Open a participant's address to show current RPC balance, indexed history and fee/net changes.
4. Open `/validation`, show sample bounds, completion time and zero failed checks. Show LIVE only when the actual workers are caught up; never conceal STALE or a backlog.

## Release checklist

- Implemented and locally checked: raw Mainnet ingestion, Supabase persistence, checkpoints/recovery, native/ERC-20 parsing, precision conversion, duplicate matching, canonical transfers, fees, address ledger, current RPC balances, explain API, landing/address/transaction/status/validation pages, independent validation and persisted results.
- Zero known mismatches in the documented eight-block sample; this is not a full-chain accounting certification.
- Prepared: production build, Dockerfile, four-service Railway instructions, backend-only secrets and verified TLS.
- **Deployment update (2026-09-21):** GitHub publication and four Railway services/domains completed with user authorization; see [active deployment](railway.md#active-deployment-2026-09-21). Historical backfill is still syncing. Sustained near-head throughput and a fresh validation sample remain operational follow-up checks.
- Docker images now build and run on Railway. Local build and start processes were also tested directly on Node.js.
- Optional webhooks remain unused; no contract or additional product features were added.
