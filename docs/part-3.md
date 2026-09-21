# Part 3 — ledger construction and read APIs

Part 3 builds address accounting from canonical movements, keeps transaction fees separate, and exposes four public read endpoints. The indexer remains a raw-data worker; the ledger worker consumes its committed records independently.

## Local operation

After configuring `.env` for Mainnet and starting PostgreSQL:

```sh
npm run db:migrate
npm run dev:indexer
# Separate terminal: continuously normalize and construct ledger entries
npm run dev:ledger
# Separate terminal: API and UI
npm run dev
```

Stop workers before applying schema migrations. Migration `003-ledger` adds the projection version, sequence and accounting fields. The ledger worker rebuilds Part 2's provisional entries and projects older Part 1 explanations without deleting raw data. `npm run project:once` remains available for a bounded batch of 100 transactions. Projection writes are atomic and idempotent. Parse failures remain visible in status; they never move or invalidate the raw checkpoint.

No accounts, plans, organizations, API keys or webhook delivery are included. Everything is local; publishing and deployment remain user-controlled.

## Accounting rules

- `feeRaw = gasUsed * effectiveGasPrice`, using integer arithmetic and native USDC's 18 decimals.
- API money values are decimal strings with at least six decimals, retaining up to all 18 when needed. No floating-point conversion or six-decimal truncation is used. An entry with no fee returns `fee: "0"`.
- Incoming entries have positive gross change; outgoing entries have negative gross change. `netChange = grossChange - fee`.
- The sender's fee is assigned to its first outgoing canonical movement exactly once. Remaining movements carry zero fee. The first movement is chosen in canonical log order, independently of descending API display order.
- A relayer, reverted transaction, approval or other transaction with no outgoing economic movement gets one `network_fee` entry: amount/gross change zero, net change negative fee, counterparty null. A recipient does not inherit the sender's fee. Part 5 retains self transfers as one `self` entry with zero gross change and any sender fee deducted once.
- Mint/burn entries retain their type; the zero-address sentinel does not get an account ledger entry. Self and zero-value transfers remain evidence, not fabricated economic movements.
- Ledger entries describe individual movements, so one transaction may appear in several rows. Summary `transactions` counts distinct indexed transactions involving the sender or a canonical participant, including reverted sender transactions.
- Summary received/sent totals cover canonical indexed history; fees cover captured sender receipts. `pendingNormalization` is the global count of transactions awaiting current ledger projection (including rejected records). It warns that history may be incomplete.

Current Mainnet balance always comes from a fresh `eth_blockNumber` followed by `eth_getBalance(address, block)`. The response includes `balanceBlock`. RPC failures return 503; history is never substituted as a current balance. Demo balances remain explicitly labeled synthetic data.

## Cursor semantics

`GET /v1/address/:address/ledger?limit=50&cursor=...` accepts limits 1–100. Page numbers and offsets are rejected. Entries sort by block, transaction index, hash and entry index, descending. Hash/entry index disambiguate legacy records and multiple movements within one transaction.

The first response captures the highest committed projection sequence. Subsequent pages retain that snapshot and use a strict keyset boundary. New blocks and later projections are excluded from that traversal; refresh without a cursor to see them. Projection commits are serialized under an advisory transaction lock so an earlier in-flight sequence cannot appear after a snapshot. Cursors are bounded, versioned, validated and scoped to the address and demo/Mainnet mode. They are opaque navigation data, not authorization credentials.

## Normalizer package

The existing `@arcledger/normalizer` package exports:

```ts
import {
  normalizeArcTransaction,
  constructAddressEntries,
} from "@arcledger/normalizer";

const result = normalizeArcTransaction({
  receipt, // Original JSON-RPC receipt; hexadecimal quantities
  timestamp, // Block timestamp as ISO 8601
  // Optional logs with numeric logIndex; defaults to receipt.logs
});
// result.movements, result.fee (raw 18-decimal units), result.duplicates,
// result.evidence, result.warnings, transaction metadata
const entries = constructAddressEntries(result, transactionIndex);
```

The package does not access the network or database. `publicEntry` formats its integer values for the read API. Original raw records are retained regardless of projection success.

## Basic abuse protection

All `/v1/*` requests use a bounded in-memory limiter: 120 requests per minute per socket IP by default, 1,200 total per minute, and at most 10,000 client buckets. `API_RATE_LIMIT` configures the per-IP limit. A limit breach returns 429, `Retry-After`, and rate-limit headers. No user-controlled forwarding header is trusted. Behind a proxy, its socket address shares a bucket; configure a trusted proxy strategy before distributing the service across instances. Limits are per process and reset when it restarts.

`/health` is a separate lightweight local process probe. `/v1/status` obtains the current RPC head and reports healthy only when indexed lag is at most two, the heartbeat is fresh, and no pending normalization or warnings remain. Demo never reports healthy Mainnet status.

## Verification

```sh
npm test
npm run build
npm run test:ui
npm run test:ledger:mainnet
```

The Part 3 smoke reads five recent Mainnet blocks, projects them into an isolated local database, checks exact fee allocation/net changes, walks cursor pages, validates transaction explanation, and independently rereads the block-pinned RPC balance. It defaults to persistent PGlite under `.local/part3-*`. Set `SMOKE_DATABASE_URL` to a localhost PostgreSQL test server to use an isolated generated schema instead. It never uses `DATABASE_URL`, signs transactions or writes to the chain. Reports are retained under `.local/`.

See [API contract](api.md) and [verification history](testing.md). Arc facts were checked through Arc MCP: [native balance precision](https://docs.arc.io/integrate/infrastructure#balance-apis), [full-precision crediting](https://docs.arc.io/integrate/exchanges/deposits#step-5-credit-deposits-at-full-precision), and [gas units versus fees](https://docs.arc.io/integrate/exchanges/withdrawals#step-2-estimate-gas-units).
