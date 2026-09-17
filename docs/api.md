# Local HTTP API

Base: http://127.0.0.1:3001. No signing or write endpoints. The Next.js server fetches this API so no browser CORS configuration is needed.

| Endpoint                                     | Result                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET /health                                  | Process liveness and configured mode; not dependency readiness                                     |
| GET /v1/status                               | Indexed coverage, observed finalized head, lag, normalization counts, heartbeat, validation status |
| GET /v1/addresses/:address?limit=20&offset=0 | Current balance snapshot, indexed totals, paginated transactions                                   |
| GET /v1/transactions/:hash                   | Canonical movements, raw decoded evidence, matching disposition, fee, warnings                     |

Addresses are 0x plus 40 hex characters; hashes are 0x plus 64. Inputs are normalized to lowercase. Limits are 1–100; offsets 0–1,000,000. Invalid inputs return 400. Unknown transactions return 404; a valid address with no indexed activity returns an empty history. Infrastructure failures return 503 and never leak credentials. Unknown routes return 404.

All financial values and block numbers are base-10 strings. Amounts including balance, received, sent, feesPaid, movement amount, and fee use 18 decimals. Evidence rawAmount uses its declared decimals. Counts are JSON numbers. Consumers must use BigInt or arbitrary precision, never parseFloat, for accounting.

Address totals cover `coverageStart` onward. They do not imply a zero opening balance. `balance` and `balanceBlock` are a separate finalized RPC snapshot; unavailable demo balances are null. `nextOffset: null` ends pagination. History includes outgoing fee-only/reverted transactions. For relayed transfers, fees belong to sender and movement belongs to its event participants.

Status `validation: not-run` and `accountingMismatches: null` are intentional. Normalization warnings count unmatched ERC-20 evidence, not balance mismatches. `duplicatesRemoved` means excluded from economic totals; the original evidence is retained.

Example:

```sh
curl http://127.0.0.1:3001/v1/addresses/0x91bd00000000000000000000000000000000a821
```
