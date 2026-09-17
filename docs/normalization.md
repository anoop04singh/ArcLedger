# Normalization contract

Treat protocol logs as evidence, not as transactions.

## Units

Canonical storage uses native USDC base units (18 decimals). ERC-20 raw units use 6 decimals and multiply by 10^12 to enter the canonical domain. Native values are never divided during accounting. Converting to ERC-20 returns both the integer quotient and remainder so sub-micro-USDC dust cannot disappear. API integer amounts are decimal strings. Display formatting uses integer arithmetic and preserves every significant fraction.

## Parsing and matching

1. Validate a complete finalized transaction receipt and its metadata.
2. Select the Transfer topic only at the configured native system emitter or USDC contract. Do not infer movement from transaction value in addition to logs.
3. Require two properly padded indexed addresses and one uint256 data word. Reject duplicate log indices, removed logs, malformed known transfers, or transfer logs in a reverted receipt.
4. Normalize amounts to native units. Native evidence creates canonical movements; zero and self transfers are marked no-movement.
5. Within this transaction only, bucket native movements by exact `(from,to,amount)`. Consume one native match per ERC-20 representation in log order. Identical repeated economic movements remain distinct.
6. Retain unmatched ERC-20 evidence, emit a warning, and exclude it from economic totals. This avoids inventing movement when authoritative evidence is missing.
7. Mint and burn use the zero-address participant. Gas is separate: `gasUsed * effectiveGasPrice`, including reverted receipts. Never derive fee from gasLimit or maxFeePerGas.

The canonical record ID combines transaction hash and native log index. Each movement retains all matched evidence indices. Matching equal logs establishes aggregate equality; call-level pairing would require traces. Sender attribution comes from Transfer topics, not the transaction submitter, which may be a relayer.

## Reconciliation is distinct

Duplicate matching is not balance reconciliation. Current balance is retrieved with eth_getBalance at a finalized block. Balance deltas can include gas and validator rewards that emit no Transfer. Part 1 exposes this limitation; `accountingMismatches` remains null until later validation exists.

Source: https://docs.arc.io/arc/references/usdc-system-events (Arc MCP).
