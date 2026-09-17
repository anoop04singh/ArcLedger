import { serve } from "@hono/node-server";
import { createArcClient, readMode, verifyChain } from "@arcledger/arc-config";
import { createPool, DemoStore, PostgresStore } from "@arcledger/database";
import { createApp } from "./app.js";
const mode = readMode();
const pool = mode === "mainnet" ? createPool() : null;
const client = createArcClient();
if (mode === "mainnet") await verifyChain(client);
const app = createApp(
  pool ? new PostgresStore(pool) : new DemoStore(),
  mode === "mainnet"
    ? async (address) => {
        const block = await client.getBlock({ blockTag: "finalized" });
        return {
          value: await client.getBalance({
            address,
            blockNumber: block.number,
          }),
          block: block.number,
        };
      }
    : undefined,
);
const server = serve(
  {
    fetch: app.fetch,
    hostname: "127.0.0.1",
    port: Number(process.env.API_PORT ?? 3001),
  },
  (info) =>
    console.log(`ArcLedger API (${mode}) http://127.0.0.1:${info.port}`),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close();
    void pool?.end();
  });
