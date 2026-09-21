import { Hono } from "hono";
import type { LedgerStore } from "@arcledger/database";
import type { Hex } from "@arcledger/types";
import {
  formatUSDC,
  publicEntry,
  canonicalSource,
} from "@arcledger/normalizer";
import { decodeCursor, encodeCursor } from "./cursor.js";
import { rateLimit, type RateLimitOptions } from "./rate-limit.js";
function blockNumber(value: string | null): number | string | null {
  if (value === null) return null;
  const n = BigInt(value);
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : value;
}
export function createApp(
  store: LedgerStore,
  balance?: (address: Hex) => Promise<{ value: bigint; block: bigint }>,
  options: { head?: () => Promise<bigint>; rateLimit?: RateLimitOptions } = {},
) {
  const app = new Hono();
  app.onError((_error, c) =>
    c.json(
      { error: "Service unavailable. Check database and RPC connectivity." },
      503,
    ),
  );
  app.use("/v1/*", rateLimit(options.rateLimit));
  app.get("/health", (c) =>
    c.json({ service: "arcledger-api", mode: store.mode, status: "ok" }),
  );
  app.get("/v1/status", async (c) => {
    let database: "healthy" | "not-configured" = "not-configured";
    if (store.mode === "mainnet") {
      try {
        if (!store.health) throw new Error("Missing database health probe");
        await store.health();
        database = "healthy";
      } catch {
        return c.json(
          {
            network: "arc-mainnet",
            chainId: 5042,
            status: "unavailable",
            database: "unavailable",
            rpc: options.head
              ? await options.head().then(
                  () => "healthy",
                  () => "unavailable",
                )
              : "not-configured",
            error: "Database unavailable. Check the backend connection.",
          },
          503,
        );
      }
    }
    const s = await store.status();
    let rpc = store.mode === "demo" ? "not-configured" : "unavailable";
    let head = store.mode === "demo" ? s.latestFinalizedBlock : null;
    if (options.head) {
      try {
        head = (await options.head()).toString();
        rpc = "healthy";
      } catch {
        head = null;
      }
    }
    const lag =
      head !== null && s.latestIndexedBlock !== null
        ? (BigInt(head) > BigInt(s.latestIndexedBlock)
            ? BigInt(head) - BigInt(s.latestIndexedBlock)
            : 0n
          ).toString()
        : null;
    const healthy =
      !!options.head &&
      s.state !== "stale" &&
      s.latestIndexedBlock !== null &&
      head !== null &&
      BigInt(head) >= BigInt(s.latestIndexedBlock) &&
      lag !== null &&
      BigInt(lag) <= 2n &&
      (s.pendingNormalization ?? 0) === 0 &&
      s.normalizationWarnings === 0;
    return c.json({
      ...s,
      ...(c.req.query("includeRecent") === "true"
        ? {
            recentTransactions: ((await store.recent?.()) ?? []).map((tx) => ({
              hash: tx.hash,
              blockNumber: tx.blockNumber,
              timestamp: tx.timestamp,
              from: tx.sender,
              to: tx.movements.length === 1 ? tx.movements[0].to : null,
              amount: formatUSDC(
                tx.movements
                  .filter((m) => m.kind !== "self")
                  .reduce((sum, m) => sum + BigInt(m.amount), 0n),
                6,
              ),
              fee: formatUSDC(tx.fee, 6),
              movements: tx.movements.length,
              status: tx.status,
              duplicates: tx.evidence.filter((e) => e.disposition === "matched")
                .length,
            })),
          }
        : {}),
      database,
      rpc,
      state:
        store.mode === "demo"
          ? "demo"
          : s.state === "stale"
            ? "stale"
            : lag === null
              ? "idle"
              : BigInt(lag) <= 2n
                ? "live"
                : "syncing",
      latestFinalizedBlock: head,
      network: "arc-mainnet",
      status: store.mode === "demo" ? "demo" : healthy ? "healthy" : "degraded",
      latestChainBlock: blockNumber(head),
      latestIndexedBlock: blockNumber(s.latestIndexedBlock),
      lag: blockNumber(lag),
    });
  });
  app.get("/v1/address/:address", async (c) => {
    const address = c.req.param("address").toLowerCase() as Hex;
    if (!/^0x[0-9a-f]{40}$/.test(address))
      return c.json({ error: "Invalid address" }, 400);
    const ledger = await store.address(address, 0, 0);
    if (store.mode === "mainnet" && !balance)
      throw new Error("Balance provider required");
    if (balance) {
      const current = await balance(address);
      ledger.balance = current.value.toString();
      ledger.balanceBlock = current.block.toString();
    }
    return c.json({
      address,
      network: "arc-mainnet",
      currency: "USDC",
      mode: store.mode,
      balance: ledger.balance === null ? null : formatUSDC(ledger.balance, 6),
      balanceBlock: ledger.balanceBlock,
      received: formatUSDC(ledger.received, 6),
      sent: formatUSDC(ledger.sent, 6),
      feesPaid: formatUSDC(ledger.feesPaid, 6),
      transactions: ledger.transactionCount,
      coverageStart: ledger.coverageStart,
      pendingNormalization: ledger.pendingNormalization ?? 0,
    });
  });
  app.get("/v1/address/:address/ledger", async (c) => {
    const address = c.req.param("address").toLowerCase() as Hex;
    if (!/^0x[0-9a-f]{40}$/.test(address))
      return c.json({ error: "Invalid address" }, 400);
    const limitText = c.req.query("limit") ?? "50";
    if (
      !/^\d{1,3}$/.test(limitText) ||
      Number(limitText) < 1 ||
      Number(limitText) > 100 ||
      c.req.query("offset") !== undefined ||
      c.req.query("page") !== undefined
    )
      return c.json({ error: "Use cursor pagination with limit 1–100" }, 400);
    let cursor;
    try {
      const text = c.req.query("cursor");
      cursor =
        text === undefined
          ? undefined
          : decodeCursor(text, address, store.mode);
    } catch {
      return c.json({ error: "Invalid cursor for this address" }, 400);
    }
    const page = await store.ledger(
      address,
      Number(limitText),
      cursor?.snapshot,
      cursor?.after,
    );
    const last = page.entries.at(-1);
    return c.json({
      address,
      network: "arc-mainnet",
      currency: "USDC",
      mode: store.mode,
      entries: page.entries.map((e) => ({
        ...publicEntry(e),
        blockNumber: blockNumber(e.blockNumber),
      })),
      nextCursor:
        page.hasMore && last
          ? encodeCursor(address, store.mode, page.snapshot, {
              block: last.blockNumber,
              transactionIndex: last.transactionIndex,
              hash: last.txHash,
              entryIndex: last.entryIndex,
            })
          : null,
    });
  });
  app.get("/v1/tx/:txHash", async (c) => {
    const hash = c.req.param("txHash").toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash))
      return c.json({ error: "Invalid transaction hash" }, 400);
    const includeRaw = c.req.query("includeRaw");
    if (
      includeRaw !== undefined &&
      includeRaw !== "true" &&
      includeRaw !== "false"
    )
      return c.json({ error: "includeRaw must be true or false" }, 400);
    const tx = await store.transaction(hash);
    if (!tx) {
      const raw = await store.rawTransaction?.(hash);
      return raw
        ? c.json(
            {
              error: "Raw transaction recorded; normalization is pending.",
              raw: includeRaw === "true" ? raw : undefined,
            },
            409,
          )
        : c.json({ error: "Transaction not indexed in current coverage" }, 404);
    }
    const single = tx.movements.length === 1 ? tx.movements[0] : null;
    return c.json({
      mode: store.mode,
      network: "arc-mainnet",
      txHash: tx.hash,
      blockNumber: blockNumber(tx.blockNumber),
      timestamp: tx.timestamp,
      final: true,
      status: tx.status,
      summary: {
        from: single?.from ?? (tx.movements.length === 0 ? tx.sender : null),
        to: single?.to ?? null,
        amount: formatUSDC(
          tx.movements.reduce((sum, m) => sum + BigInt(m.amount), 0n),
          6,
        ),
        amountSemantics: "total canonical transfer volume",
        fee: formatUSDC(tx.fee, 6),
        feePayer: tx.sender,
        currency: "USDC",
      },
      normalization: {
        canonicalSource: canonicalSource(tx),
        duplicateRepresentationsRemoved: tx.evidence.filter(
          (e) => e.disposition === "matched",
        ).length,
      },
      sources: tx.evidence.map((e) => ({
        ...e,
        type: e.source === "native" ? "eip7708" : "erc20",
        amount: formatUSDC(e.amount, 6),
        duplicate: e.disposition === "matched",
      })),
      movements: tx.movements.map((m) => ({
        ...m,
        amount: formatUSDC(m.amount, 6),
      })),
      warnings: tx.warnings,
      explanation: tx,
      raw:
        includeRaw === "true"
          ? ((await store.rawTransaction?.(hash)) ?? null)
          : undefined,
    });
  });
  return app;
}
