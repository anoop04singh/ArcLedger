import { describe, it, expect } from "vitest";
import { createApp } from "../apps/api/src/app.js";
import { DemoStore, DEMO_ADDRESS, DEMO_HASH } from "@arcledger/database";
const app = createApp(new DemoStore());
describe("Part 3 public read API", () => {
  it("returns optional recent transactions with exact decimal fees and explicit demo mode", async () => {
    const result = await (
      await app.request("/v1/status?includeRecent=true")
    ).json();
    expect(result.mode).toBe("demo");
    expect(result.recentTransactions).toHaveLength(3);
    expect(result.recentTransactions[0]).toMatchObject({
      hash: DEMO_HASH,
      amount: "10.000000",
      fee: "0.000420",
      duplicates: 1,
      status: "success",
    });
    expect(
      (await (await app.request("/v1/status")).json()).recentTransactions,
    ).toBeUndefined();
  });
  it("reports demo mode without claiming healthy Mainnet", async () => {
    const s = await (await app.request("/v1/status")).json();
    expect(s).toMatchObject({
      mode: "demo",
      status: "demo",
      network: "arc-mainnet",
      chainId: 5042,
      latestIndexedBlock: 291294,
      lag: 0,
      accountingMismatches: null,
    });
  });
  it("returns decimal summary and paginates ledger by cursor", async () => {
    const summary = await (
      await app.request(`/v1/address/${DEMO_ADDRESS}`)
    ).json();
    expect(summary).toMatchObject({
      received: "185.000000",
      sent: "10.000000",
      balance: "174.999580",
      feesPaid: "0.000420",
      transactions: 3,
    });
    const first = await (
      await app.request(`/v1/address/${DEMO_ADDRESS}/ledger?limit=1`)
    ).json();
    expect(first.entries).toHaveLength(1);
    expect(first.entries[0]).toMatchObject({
      direction: "outgoing",
      amount: "10.000000",
      fee: "0.000420",
      grossChange: "-10.000000",
      netChange: "-10.000420",
      final: true,
    });
    const second = await (
      await app.request(
        `/v1/address/${DEMO_ADDRESS}/ledger?limit=1&cursor=${first.nextCursor}`,
      )
    ).json();
    expect(second.entries[0]).toMatchObject({
      direction: "incoming",
      amount: "25.000000",
      fee: "0",
      netChange: "25.000000",
    });
    expect(second.entries[0].id).not.toBe(first.entries[0].id);
    const third = await (
      await app.request(
        `/v1/address/${DEMO_ADDRESS}/ledger?limit=1&cursor=${second.nextCursor}`,
      )
    ).json();
    expect(third.nextCursor).toBeNull();
    expect(
      (
        await app.request(
          `/v1/address/0x${"ff".repeat(20)}/ledger?cursor=${first.nextCursor}`,
        )
      ).status,
    ).toBe(400);
  });
  it("explains canonical movements and duplicate evidence", async () => {
    const body = await (await app.request(`/v1/tx/${DEMO_HASH}`)).json();
    expect(body.summary).toMatchObject({
      amount: "10.000000",
      fee: "0.000420",
      currency: "USDC",
    });
    expect(body.normalization).toEqual({
      canonicalSource: "eip7708",
      duplicateRepresentationsRemoved: 1,
    });
    expect(
      body.sources.map((s: any) => [s.type, s.decimals, s.duplicate]),
    ).toEqual([
      ["eip7708", 18, false],
      ["erc20", 6, true],
    ]);
  });
  it("rejects malformed input and page-number pagination", async () => {
    for (const path of [
      "/v1/address/nope",
      "/v1/tx/0x123",
      `/v1/address/${DEMO_ADDRESS}/ledger?limit=0`,
      `/v1/address/${DEMO_ADDRESS}/ledger?limit=101`,
      `/v1/address/${DEMO_ADDRESS}/ledger?offset=0`,
      `/v1/address/${DEMO_ADDRESS}/ledger?page=1`,
      `/v1/address/${DEMO_ADDRESS}/ledger?cursor=!!!`,
      `/v1/address/${DEMO_ADDRESS}/ledger?cursor=`,
      `/v1/tx/${DEMO_HASH}?includeRaw=yes`,
    ])
      expect((await app.request(path)).status, path).toBe(400);
  });
  it("has four core read paths, unknown tx 404 and empty ledger", async () => {
    expect((await app.request(`/v1/tx/0x${"ff".repeat(32)}`)).status).toBe(404);
    expect((await app.request(`/v1/transactions/${DEMO_HASH}`)).status).toBe(
      404,
    );
    const empty = await (
      await app.request(`/v1/address/0x${"ff".repeat(20)}/ledger`)
    ).json();
    expect(empty.entries).toEqual([]);
    expect(empty.nextCursor).toBeNull();
  });
  it("uses a fresh RPC balance preserving dust and leaves indexed totals unchanged", async () => {
    let calls = 0;
    const live = createApp(new DemoStore(), async () => ({
      value: ++calls === 1 ? 123n : 456n,
      block: 500n,
    }));
    const path = `/v1/address/${DEMO_ADDRESS}`;
    const body = await (await live.request(path)).json();
    expect(body.balance).toBe("0.000000000000000123");
    expect(body.balanceBlock).toBe("500");
    expect(body.received).toBe("185.000000");
    expect((await (await live.request(path)).json()).balance).toBe(
      "0.000000000000000456",
    );
  });
  it("returns 503 rather than a fabricated balance on RPC failure", async () => {
    const live = createApp(new DemoStore(), async () => {
      throw new Error("provider secret");
    });
    const r = await live.request(`/v1/address/${DEMO_ADDRESS}`);
    expect(r.status).toBe(503);
    expect(await r.text()).not.toContain("provider secret");
  });
  it("rate limits, ignores forged forwarded headers and recovers after the window", async () => {
    let now = 1000;
    const limited = createApp(new DemoStore(), undefined, {
      rateLimit: { limit: 2, windowMs: 1000, now: () => now },
    });
    expect((await limited.request("/v1/status")).status).toBe(200);
    expect((await limited.request("/v1/status")).status).toBe(200);
    const blocked = await limited.request("/v1/status", {
      headers: { "X-Forwarded-For": "1.2.3.4" },
    });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("1");
    now += 1000;
    expect((await limited.request("/v1/status")).status).toBe(200);
  });
  it("compares health to the current RPC head rather than stale observed head", async () => {
    const store = new DemoStore();
    Object.defineProperty(store, "mode", { value: "mainnet" });
    Object.assign(store, {
      health: async () => ({
        database: "healthy",
        checkedAt: new Date().toISOString(),
      }),
    });
    const original = store.status.bind(store);
    store.status = async () => ({
      ...(await original()),
      mode: "mainnet",
      state: "live",
      pendingNormalization: 0,
    });
    let head = 291295n;
    const live = createApp(store, undefined, { head: async () => head });
    expect((await (await live.request("/v1/status")).json()).status).toBe(
      "healthy",
    );
    head += 9n;
    expect(await (await live.request("/v1/status")).json()).toMatchObject({
      status: "degraded",
      state: "syncing",
      latestChainBlock: 291304,
      lag: 10,
    });
  });
});
