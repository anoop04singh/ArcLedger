# Part 4 — Supabase and frontend

ArcLedger uses Supabase only as managed PostgreSQL. The local indexer, ledger worker and API connect through the shared `packages/database/src/client.ts` factory. The browser has no Supabase client, connection string or secret key. The Parts 2–3 table definitions and deterministic entry IDs remain unchanged.

## Configuration

Create/select one Supabase project. Copy the **Session Pooler** URL from its Connect dialog, using port **5432** for IPv4-only environments. Do not construct the hostname from the region. A direct PostgreSQL URL also works with IPv6 connectivity. ArcLedger rejects port 6543 because its worker relies on session-level advisory locks.

Put the following in the git-ignored root `.env`:

```ini
ARCLEDGER_MODE=mainnet
DATABASE_URL="<copied Session Pooler or direct PostgreSQL URL>"
DATABASE_SSL_CA_FILE="<absolute path to downloaded Supabase server CA certificate>"
DATABASE_POOL_MAX=5
PRIMARY_RPC_URL=https://rpc.drpc.mainnet.arc.io
FALLBACK_RPC_URL=https://rpc.blockdaemon.mainnet.arc.io
API_URL=http://127.0.0.1:3001
```

`ARC_RPC_URL` and `ARC_FALLBACK_RPC_URL` are supported aliases. The PRIMARY/FALLBACK names take precedence. `NEXT_PUBLIC_API_URL` is an optional fallback for the server-side UI relay; prefer `API_URL`. Never put a database URL/password or Supabase secret key in a `NEXT_PUBLIC_` variable. No Supabase SDK or API key is needed for this integration. If later administrative tooling needs one, use a server-only `sb_secret_...` key.

Remote PostgreSQL always uses TLS with certificate and hostname verification. Download the CA from **Database Settings → SSL Configuration**, and keep its path absolute so each workspace resolves it correctly. The implementation does not disable certificate verification when a connection string specifies a weaker SSL mode. Local loopback PostgreSQL can use plaintext for development.

## Connect, migrate and verify

```sh
npm run check:database
npm run db:migrate
npm run verify:database
```

Run migrations before starting persistent workers. `check:database` runs `SELECT NOW()` without printing connection credentials. Migrations retain all existing data and constraints, and revoke browser Data API role access (`anon`, `authenticated`, PUBLIC) on ArcLedger tables. This changes access permissions only, not table structure. Disable Supabase's Data API for this database-only project in the dashboard as an additional configuration measure if it is not needed.

`verify:database` uses the configured database, so run it intentionally against the ArcLedger project with other indexers stopped. It records two blocks, closes the indexer session, starts it again, verifies the next two blocks continue from the durable checkpoint, projects pending records, and reads database-backed API status. It never resets the checkpoint or changes the start block of an existing database. It is bounded to four committed blocks and at most ten projection batches. It writes a non-secret report to `.local/part4-database-verification.json`.

Then run these in separate local terminals:

```sh
npm run dev:indexer
npm run dev:ledger
npm run dev
```

The UI is at `http://127.0.0.1:3000`. These commands run local services; they do not deploy the application. A stopped indexer is correctly marked stale while the database can remain healthy. A bounded verification run is not a live-lag benchmark.

## Frontend

- Landing: ArcLedger title, requested accounting copy, address/hash search and exactly three capability cards. The additional marketing section was removed.
- Address: RPC balance, indexed summary metrics, dated movement rows with fees/net changes, finality, and **Load more**. Cursor pages append to the current view, preserve existing rows on errors, prevent duplicate clicks and allow retry.
- The browser's load-more request uses a fixed, read-only same-origin route, `/api/ledger/:address`, which relays to the Hono API. It never accesses PostgreSQL. It preserves API validation/rate-limit errors and does not accept an arbitrary upstream URL.
- Transaction: original 18/6-decimal evidence, canonical/matched labels, subtle convergence animation, canonical source, matched record count, duplicate count and canonical movement result. Empty or multi-movement transactions are not labeled as a single matched payment.
- Status: latest chain block, indexed block, lag, canonical/duplicate counts, pending normalization, and a real PostgreSQL health indicator. Demo explicitly shows database **NOT CONFIGURED**. Connection failures report **UNAVAILABLE** without revealing credentials.
- Reduced-motion preferences disable the convergence animation. Desktop/mobile layout follows the existing light glass design.

Full historical balance reconciliation is still not implemented. Accounting mismatches remain unknown, never a fabricated zero. Optional webhooks were not started; their existing reserved tables remain unused.

## Sources and checks

Supabase guidance: [connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres), [verified TLS](https://supabase.com/docs/guides/platform/ssl-enforcement). Arc protocol details remain sourced from the Arc MCP references documented in Parts 1–3.

Run `npm test`, `npm run build`, and the browser tests locally. The demo browser suite expects `ARCLEDGER_MODE=demo`; restart the local API with that mode to run it, then restore Mainnet. Real Supabase-backed desktop/mobile verification is recorded separately in [testing history](testing.md).
