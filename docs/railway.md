# Deploy ArcLedger to Railway

The repository is prepared for deployment; no service has been deployed by the coding agent. You publish the repository and perform these steps. All four services run from the **repository root**, using the root Dockerfile. Do not set a service root to `apps/web` or `apps/api`: they depend on shared workspace packages. The image includes the TypeScript runtime and builds Next.js without database credentials.

## 1. Prepare Supabase

Use the existing project or a new dedicated project. Copy its **Session Pooler connection URL, port 5432**, from Connect. Use the database password, URL-encoded when necessary. Port 6543 transaction pooling is rejected because the indexer needs a session advisory lock. A direct connection is also supported when reachable from the host.

Download the Supabase CA from Database Settings → SSL Configuration. Locally, use `DATABASE_SSL_CA_FILE`. On Railway, set **`DATABASE_SSL_CA` to the complete PEM certificate contents**, including BEGIN/END lines and actual newlines. Do not paste a Windows file path into Railway. Remote PostgreSQL always uses TLS with certificate verification; do not disable verification to address a connection error.

With your git-ignored local `.env` targeting this database:

```sh
npm ci
npm run check:database
npm run db:migrate
```

Migrations are repeatable and serialized. Run them before starting the services. Migration 004 queues previously stored raw transactions for re-projection to retain self transfers; run the ledger worker until pending normalization is zero. Existing raw records and the indexer checkpoint remain intact. Refresh old ledger cursors after this one-time projection rebuild.

The app uses PostgreSQL directly; no Supabase administrative API key is needed. Migrations revoke `anon` and `authenticated` access to the application tables. Database credentials belong only to backend services. Never put them in `NEXT_PUBLIC_*` variables or the web service.

## 2. Create four Railway services

Push the repository to your GitHub account. In one Railway project/environment, create four services from that repository, named exactly as below. For each service, use the root Dockerfile, root directory `/`, one replica, and the indicated custom start command. Disable automatic sleeping for persistent workers. Enable restart on failure for both workers.

| Service   | Start command           | Variables unique to service                                                 | HTTP healthcheck |
| --------- | ----------------------- | --------------------------------------------------------------------------- | ---------------- |
| `web`     | `npm run start:web`     | `PORT=3000`, `API_URL=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}` | `/`              |
| `api`     | `npm run start:api`     | `PORT=3001`, `HOST=::`, `API_RATE_LIMIT=120`                                | `/health`        |
| `indexer` | `npm run start:indexer` | Optional `INDEX_START_BLOCK`; see below                                     | None — worker    |
| `ledger`  | `npm run start:ledger`  | None                                                                        | None — worker    |

`api` binds both address families using `HOST=::`, allowing Railway private networking. `web` uses its server-side API relay; the browser never calls the private hostname. Give `web` a Railway public domain targeting port 3000. If external clients need the public read API, give `api` a public domain targeting port 3001 too. Do not expose worker ports.

Set these backend variables on **api, indexer and ledger**, using Railway shared variables/references where appropriate:

```ini
NODE_ENV=production
ARCLEDGER_MODE=mainnet
DATABASE_URL=<Supabase Session Pooler URL>
DATABASE_SSL_CA=<complete multiline CA certificate PEM>
DATABASE_POOL_MAX=5
PRIMARY_RPC_URL=<working Arc Mainnet RPC URL>
FALLBACK_RPC_URL=<independent Arc Mainnet RPC URL>
```

`ARC_RPC_URL` and `ARC_FALLBACK_RPC_URL` are accepted aliases. Providers must return chain ID 5042. Check provider quotas and use a plan that can sustain indexing. Set `NODE_ENV=production` on web as well. Keep RPC credentials off the web service. This setup uses four small persistent services; Railway and Supabase billing/connection limits are your responsibility.

On a fresh database, unset `INDEX_START_BLOCK` to begin at the current head, or specify a recent block for backfill. On an existing database, the saved checkpoint takes precedence; changing the variable does not skip missing blocks. Leave `INDEXER_POLL_MS=250`, `INDEXER_BLOCK_PREFETCH=4`, and `INDEXER_TX_CONCURRENCY=32` at their defaults initially. Run one indexer instance; its database lock prevents concurrent writers. Run one ledger instance. The ledger worker is required to populate canonical transfers and address history.

## 3. Verify after you deploy

1. Check API `/health` responds, then `/v1/status` reports `database: healthy` and `rpc: healthy`.
2. Confirm the indexed block advances, pending normalization drains, and lag approaches 0–2 blocks. A historical backfill may take time; do not reset the checkpoint to conceal lag.
3. Restart the indexer service. Confirm it resumes at the next stored block and counts do not duplicate. Check Railway worker logs for persistent retries.
4. From your local checkout targeting the same Supabase database, run `npm run validate:mainnet`. This fetches real Arc blocks and stores a bounded validation result. It does not change the ingestion checkpoint. Run when normalization has caught up.
5. Open the public `/validation` page. Confirm the range, timestamp, status, fee mismatches and accounting mismatches reflect the completed run. `VALID` applies to that sample only.
6. Search a real indexed hash, inspect its raw/canonical matching and fee, then open a participant's address and load another ledger page.

`/health` is liveness, not a promise that indexing has caught up. `/v1/status` includes fresh RPC and database checks. Never use a stale validation sample as evidence that current indexing is healthy. Validation is an explicit command, not an automatic scheduler.

To select a different sample, set `VALIDATION_START_BLOCK` and `VALIDATION_END_BLOCK` in the shell or local `.env`; choose 1–1000 contiguous stored blocks. The default is the latest five complete raw blocks. Remove these overrides afterward for fresh samples. A pending projection, missing raw record, or failed RPC makes validation fail rather than reporting a false zero.

## Operations and troubleshooting

- DB TLS failure: check the CA PEM and Session Pooler URL; keep certificate verification enabled.
- API inaccessible: verify `HOST=::`, `PORT=3001`, and domain target port. Web `API_URL` must reference the service name `api` in the same environment.
- Healthy raw ingestion but empty ledger: ensure `ledger` is running, inspect normalization warnings and projection errors.
- RPC failures/lag: inspect provider limits and configure an independent fallback. RPCs are chain-checked before ingestion; wrong-chain responses stop the worker.
- Migrations: stop workers for schema upgrades, apply migrations once from the repository, then restart. Back up Supabase before future schema changes. Do not delete the checkpoint as a recovery shortcut.
- Rate limits are bounded per process/socket IP with an aggregate cap; Railway proxy traffic may share an IP. This deliberately avoids trusting spoofable forwarded headers. Scale and tune only after measuring legitimate load.
- Secrets: `.env`, local test databases, certificates and build caches are excluded from Git/Docker contexts. Use Railway's variable UI; do not bake credentials into the image.

Railway references: [shared monorepos](https://docs.railway.com/deployments/monorepo), [custom start commands](https://docs.railway.com/deployments/start-command), [private networking](https://docs.railway.com/networking/private-networking), [service domains](https://docs.railway.com/networking/domains/working-with-domains).
