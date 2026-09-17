import { Hono } from "hono";
import type { LedgerStore } from "@arcledger/database";
import type { Hex } from "@arcledger/types";
export function createApp(
  store: LedgerStore,
  balance?: (address: Hex) => Promise<{ value: bigint; block: bigint }>,
) {
  const app = new Hono();
  app.onError((error, c) => {
    console.error(error.message);
    return c.json(
      { error: "Service unavailable. Check database and RPC connectivity." },
      503,
    );
  });
  app.get("/health", (c) =>
    c.json({ service: "arcledger-api", mode: store.mode, status: "ok" }),
  );
  app.get("/v1/status", async (c) => c.json(await store.status()));
  app.get("/v1/transactions/:hash", async (c) => {
    const hash = c.req.param("hash").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash))
      return c.json({ error: "Invalid transaction hash" }, 400);
    const tx = await store.transaction(hash);
    return tx
      ? c.json({ ...tx, mode: store.mode })
      : c.json({ error: "Transaction not indexed in current coverage" }, 404);
  });
  app.get("/v1/addresses/:address", async (c) => {
    const address = c.req.param("address").toLowerCase() as Hex;
    if (!/^0x[0-9a-f]{40}$/.test(address))
      return c.json({ error: "Invalid address" }, 400);
    const limitText = c.req.query("limit") ?? "20",
      offsetText = c.req.query("offset") ?? "0";
    if (!/^\d+$/.test(limitText) || !/^\d+$/.test(offsetText))
      return c.json({ error: "Invalid pagination" }, 400);
    const limit = Number(limitText),
      offset = Number(offsetText);
    if (
      !Number.isSafeInteger(offset) ||
      offset > 1000000 ||
      limit < 1 ||
      limit > 100
    )
      return c.json(
        { error: "Limit must be 1–100; offset must be 0–1000000" },
        400,
      );
    const ledger = await store.address(address, limit, offset);
    if (balance) {
      const current = await balance(address);
      ledger.balance = current.value.toString();
      ledger.balanceBlock = current.block.toString();
    }
    return c.json(ledger);
  });
  return app;
}
