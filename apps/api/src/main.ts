import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { createArcRpc, readMode } from "@arcledger/arc-config";
import { createPool, DemoStore, PostgresStore } from "@arcledger/database";
import { createApp } from "./app.js";
const mode = readMode(),
  pool = mode === "mainnet" ? createPool() : null,
  rpc = createArcRpc();
const app = createApp(
  pool ? new PostgresStore(pool) : new DemoStore(),
  mode === "mainnet"
    ? async (address) => {
        const block = await rpc.blockNumber();
        return { value: await rpc.balance(address, block), block };
      }
    : undefined,
  {
    head: mode === "mainnet" ? () => rpc.blockNumber() : undefined,
    rateLimit: {
      key: (c) => getConnInfo(c).remote.address ?? "unknown",
      limit: Number(process.env.API_RATE_LIMIT ?? 120),
    },
  },
);
const server = serve(
  {
    fetch: app.fetch,
    hostname: process.env.HOST ?? "127.0.0.1",
    port: Number(process.env.PORT ?? process.env.API_PORT ?? 3001),
  },
  (info) =>
    console.log(`ArcLedger API (${mode}) http://127.0.0.1:${info.port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close();
    void pool?.end();
  });
