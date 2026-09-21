# Normalization contract

Treat protocol logs as evidence, not as transactions.

## Units

Canonical storage uses native USDC base units (18 decimals). ERC-20 raw units use 6 decimals and multiply by 10^12 to enter the canonical domain. Native values are never divided during accounting. Converting to ERC-20 returns both the integer quotient and remainder so sub-micro-USDC dust cannot disappear. API integer amounts are decimal strings. Display formatting uses integer arithmetic and preserves every significant fraction.

## Parsing and matching

1. Validate a complete finalized transaction receipt and its metadata.
2. Select the Transfer topic only at the configured native system emitter or USDC contract. Do not infer movement from transaction value in addition to logs.
3. Require two properly padded indexed addresses and one uint256 data word. Reject duplicate log indices, removed logs, malformed known transfers, or transfer logs in a reverted receipt.
4. Normalize amounts to native units. Native evidence creates canonical movements; zero transfers are marked no-movement. A nonzero self transfer retains one audit record with zero transfer balance change.
5. Within this transaction only, bucket native movements by exact `(from,to,amount)`. Consume one native match per ERC-20 representation in log order. Identical repeated economic movements remain distinct.
6. Arc emits no native log for self transfers. Retain a nonzero ERC-20 self transfer as a canonical `self` audit record (6-decimal amount scaled by 10^12), without inventing a native event. If native self evidence is provided, match it once. Other unmatched ERC-20 evidence emits a warning and is excluded from economic totals. This avoids inventing movement when authoritative evidence is missing.
7. Mint and burn use the zero-address participant. Gas is separate: `gasUsed * effectiveGasPrice`, including reverted receipts. Never derive fee from gasLimit or maxFeePerGas.

The canonical record ID combines transaction hash and canonical evidence log index (native normally, ERC-20 for self records). Each movement retains all matched evidence indices. Matching equal logs establishes aggregate equality; call-level pairing would require traces. Sender attribution comes from Transfer topics, not the transaction submitter, which may be a relayer.

## Reconciliation is distinct

Duplicate matching is not balance reconciliation. Current balance is retrieved with eth_getBalance at a finalized block. Balance deltas can include gas and validator rewards that emit no Transfer. Part 5 independently validates raw RPC records, canonical evidence, receipt fees and address ledger arithmetic for a stored block range. `accountingMismatches` is null before a run or on validation error; numeric results describe the latest sample only. `/validation` shows its range and timestamp. This does not certify full historical balance or validator-reward reconciliation.

Source: https://docs.arc.io/arc/references/usdc-system-events (Arc MCP).

## Fees and self transfers

Every fee is `gasUsed × effectiveGasPrice` in native 18-decimal USDC, assigned once to the transaction submitter. A relayer pays the fee separately from the token owner. Each outgoing entry has `grossChange = -amount` and `netChange = grossChange - fee`; recipients pay no sender fee. A self entry has `grossChange = 0`, so its net change is zero unless that account also paid the transaction fee. Self amounts are excluded from received/sent summary totals.

`canonicalSource` is `eip7708`, `erc20-self`, `mixed`, or null. The explain UI identifies this source and labels self records as zero balance movement. Native-only self calls emit no transfer event and cannot be reconstructed as separate calls from receipt logs; no synthetic event is fabricated.
