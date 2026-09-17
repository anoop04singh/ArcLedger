# ArcLedger MVP — Part 1 of 5

## Foundation, Scope & Architecture

## 1. Project Definition

Build **ArcLedger**, an open-source normalization and accounting layer for USDC activity on Arc Mainnet.

ArcLedger should answer one core question:

> **What actually happened to this address's USDC?**

Arc exposes USDC through both its native EVM representation and an ERC-20 interface. These representations have different decimal precision and can expose the same economic movement through multiple protocol-level records.

ArcLedger must convert those raw protocol records into **one canonical economic ledger**.

---

# 2. Core Problem

Arc uses one underlying USDC balance through two interfaces:

```text
                 ONE USDC BALANCE
                        │
              ┌─────────┴──────────┐
              │                    │
       Native interface       ERC-20 interface
              │                    │
        18 decimals            6 decimals
              │                    │
          gas/value          transfer/approve
```

They are not separate assets.

ArcLedger must correctly account for:

```text
Native USDC transfers
ERC-20 USDC transfers
Gas paid in USDC
18 ↔ 6 decimal normalization
Duplicate protocol representations
```

Do not assume:

```text
one log = one economic transaction
```

Instead:

```text
protocol logs
↓
candidate movements
↓
canonical economic movements
```

---

# 3. Product Positioning

ArcLedger is not:

```text
another block explorer
another Etherscan
another Graph
another Goldsky
a portfolio tracker
a generic multichain indexer
```

Its role is:

> **The accounting layer for Arc USDC.**

Suggested tagline:

> **One dollar. One ledger.**

Suggested subtitle:

> Normalize native transfers, ERC-20 activity and gas into one canonical USDC ledger.

---

# 4. MVP Scope

Build only:

1. Arc Mainnet USDC indexer
2. Canonical normalization and deduplication engine
3. Address Ledger API
4. Transaction Explain API
5. Minimal search/explorer UI
6. Mainnet validation/status page

Optional only if the above is complete:

7. Webhooks
8. Lightweight SDK

---

# 5. Explicitly Out of Scope

Do not build:

```text
authentication
billing
organizations
teams
paid API plans
complex API key management
multichain support
EURC indexing
USYC indexing
DEX classification
swap classification
portfolio tracking
wallet labels
AI classification
tax reports
accounting exports
MCP server
GraphQL
SQL query builder
complex analytics
charts
mobile app
```

Keep the project sharply focused on Arc USDC normalization.

---

# 6. Architecture

Use:

```text
                           ARC MAINNET
                               │
                               │
                     blocks + receipts + logs
                               │
                               ▼
                    ┌───────────────────┐
                    │  Arc Ingestor     │
                    └─────────┬─────────┘
                              │
                              ▼
              ┌─────────────────────────────┐
              │     Arc Normalizer          │
              │                             │
              │ EIP-7708 parsing            │
              │ ERC20 USDC parsing          │
              │ 18 ↔ 6 conversion           │
              │ duplicate reconciliation    │
              │ fee calculation             │
              └──────────────┬──────────────┘
                             │
                             ▼
                        PostgreSQL
                             │
            ┌────────────────┼────────────────┐
            │                │                │
            ▼                ▼                ▼
       Address API       Tx Explain       Webhooks
            │                │
            └────────┬───────┘
                     ▼
                Next.js UI
```

The core of the project is:

```text
Arc Normalizer
```

Spend most engineering effort on normalization correctness.

---

# 7. Tech Stack

## Frontend

```text
Next.js
TypeScript
Tailwind CSS
shadcn/ui
Framer Motion
Lucide Icons
```

## Backend

```text
Node.js
TypeScript
Fastify or Hono
viem
```

## Indexer

```text
Node.js
TypeScript
viem
```

## Database

```text
PostgreSQL
```

Recommended hosted options:

```text
Supabase
Neon
```

Do not introduce:

```text
Kafka
ClickHouse
ElasticSearch
Redis Streams
Kubernetes
```

for the MVP.

---

# 8. Repository Structure

Use a monorepo:

```text
arcledger/
│
├── apps/
│   ├── web/
│   ├── api/
│   └── indexer/
│
├── packages/
│   ├── normalizer/
│   ├── database/
│   ├── arc-config/
│   └── types/
│
├── examples/
│   └── node-client/
│
├── docs/
│   ├── architecture.md
│   ├── normalization.md
│   └── api.md
│
├── docker-compose.yml
│
└── README.md
```

---

# 9. Arc Configuration Package

Create:

```text
packages/arc-config
```

Keep all Arc constants there.

Example:

```typescript
export const ARC_MAINNET = {
  chainId: 5042,
  rpcUrl: process.env.ARC_RPC_URL!,
  usdc: "0x3600000000000000000000000000000000000000",
  nativeDecimals: 18,
  erc20Decimals: 6,
  decimalOffset: 12,
};
```

Also configure the EIP-7708 system emitter here.

Do not hardcode Arc-specific constants throughout the application.

---

# 10. Chain Adapter

Keep Arc-specific accounting logic behind an adapter.

Use:

```typescript
interface ChainAccountingAdapter {
  parseMovements(input: unknown): Promise<Movement[]>;
  calculateFee(input: unknown): bigint;
  normalizeBalance(value: bigint): bigint;
}
```

Implement:

```typescript
class ArcAccountingAdapter
  implements ChainAccountingAdapter
```

Avoid scattered logic such as:

```typescript
if (chainId === 5042) {
  // Arc-specific hack
}
```

---

# 11. Main Engineering Principle

Always follow:

> **Treat protocol logs as evidence, not as transactions.**

ArcLedger takes one or more low-level records and produces one economic movement.

Example:

```text
EIP-7708 Transfer      $10
ERC-20 Transfer        $10

          ↓

ArcLedger

Canonical movement     $10
```

Not:

```text
$20
```

---

# 12. Definition of MVP Complete

The MVP is complete when all of these work:

```text
Arc Mainnet ingestion
EIP-7708/native USDC indexing
ERC-20 USDC indexing
duplicate detection
18 ↔ 6 decimal normalization
canonical economic movements
gas fee calculation in USDC
current balance retrieval
address transaction history
transaction explain API
transaction explain UI
public deployment
public repository
live indexer status
mainnet validation
```

Do not expand scope before these are working.
