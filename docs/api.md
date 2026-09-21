# ArcLedger read API — MVP

Local base: `http://127.0.0.1:3001`. No authentication is required. Four core GET endpoints use the same basic server-side rate limiter. `/health` is an infrastructure probe. Earlier plural/offset routes are replaced; the UI and example client use these paths.

Money values in the public summaries and ledger are **USDC decimal strings**, with at least six decimals and all significant native precision retained. Zero entry fees use `"0"`. Block numbers are JSON numbers while safely representable, otherwise decimal strings. Hashes/addresses are lowercase. `mode: "demo"` always identifies synthetic records.

## GET /v1/status

Returns `network`, `chainId`, `status`, `latestChainBlock`, `latestIndexedBlock`, and `lag`. Status is `healthy`, `degraded` or `demo`. Mainnet head comes directly from RPC. Existing diagnostics remain: heartbeat/state, coverage start, raw counts, canonical count, duplicates removed, warnings, pending normalization and accounting validation. A fresh indexer with at most two blocks of lag and no projection backlog/warnings is healthy. No checkpoint yields null index/lag. Database failure returns 503 with sanitized health fields. RPC failure with a healthy database returns degraded status, `rpc: "unavailable"`, and null chain head/lag. `rpc: "healthy"` confirms a fresh chain-head read. `validation` is `not-run`, `valid`, `invalid` or `error`; `validationRun` includes the persisted sample range, timestamps, counts, fee/accounting mismatch counts, scope and capped findings. `accountingMismatches` is the sum of fee and other failed checks in the sample (not a count of unique bad transactions); it is null before validation or on error. A successful sample does not certify later blocks or reconstruct lifetime balances.

## GET /v1/address/:address

Returns `address`, `network`, `currency: "USDC"`, `mode`, `balance`, `balanceBlock`, `received`, `sent`, `feesPaid`, and `transactions`. Coverage and pending-normalization metadata identify incomplete history. Current Mainnet balance is a block-pinned RPC snapshot, independent of database totals. `transactions` is a count, not a history array. A valid unindexed address still receives its RPC balance and zero history totals.

## GET /v1/address/:address/ledger

Use `?limit=50&cursor=...`; default 50, maximum 100. The response contains `address`, `network`, `currency`, `mode`, `entries` and `nextCursor` (null at the end). Do not parse or modify the cursor. An empty history is 200 with an empty array. Offset/page parameters are rejected.

```json
{
  "direction": "outgoing",
  "counterparty": "0x...",
  "amount": "10.000000",
  "fee": "0.000031",
  "grossChange": "-10.000000",
  "netChange": "-10.000031",
  "type": "transfer",
  "txHash": "0x...",
  "blockNumber": 123456,
  "timestamp": "2026-09-19T10:00:00.000Z",
  "final": true,
  "status": "success"
}
```

Entries also carry `id`, `address`, `transactionIndex`, and `entryIndex`. Directions are `incoming`/`outgoing`/`self`; types are `transfer`, `mint`, `burn`, `self`, and `network_fee`. A self transfer retains one record, has zero gross change, and only deducts any sender fee. Self amounts do not inflate sent/received totals. A reverted transaction has no transfer but retains its sender's network fee. Fees are assigned once per transaction; [Part 3](part-3.md) explains allocation and stable snapshot pagination.

## GET /v1/tx/:txHash

Returns transaction identity/finality and:

- `summary`: from, to, amount, fee, feePayer, currency, amountSemantics.
- `normalization`: canonicalSource (`eip7708`, `erc20-self`, `mixed`, or null), duplicateRepresentationsRemoved.
- `sources`: each evidence record's source type, decimals, rawAmount, formatted amount, disposition, log index, participants and duplicate flag.
- `movements`: canonical movements with formatted amounts; repeated transfers remain separate.
- `warnings`: unmatched or other normalization evidence.
- `explanation`: the reusable normalizer's full result, whose fee/movement/evidence amounts are **raw native 18-decimal integer strings**. `rawAmount` in evidence retains its source decimals. This object supports precise downstream tooling and the normalization visualization.

Summary amount is explicitly **total canonical transfer volume**, not a sender's net change. Multi-movement transactions have null summary from/to; use individual movements or address ledger entries. For a transaction without movements, amount is zero, from is the fee payer and to is null.

`?includeRaw=true` additionally includes retained original transaction, receipt and logs. This replaces the separate Part 2 raw endpoint while preserving audit access. A recorded but unnormalized transaction returns 409, with raw data included when requested. Unknown transactions return 404; legacy normalized transactions may have `raw: null`.

## Errors and limits

400: invalid address/hash, limit/cursor or query option. 404: unknown transaction/route. 409: normalization pending. 429: rate limited, with `Retry-After` and `X-RateLimit-*` headers. 503: database/RPC unavailable; no provider credentials are exposed. Limit defaults: 120 per socket IP per minute, 1,200 aggregate per minute. Forwarded headers are ignored. See [operational details](part-3.md#basic-abuse-protection).

## Database health (Part 4)

`GET /v1/status` includes `database: "healthy"` after a successful server-side `SELECT NOW()`, or `"not-configured"` in demo mode. A connection failure returns 503 with `database: "unavailable"` and a sanitized error. No database credentials or server identity are returned.
