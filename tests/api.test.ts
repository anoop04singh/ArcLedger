import { describe, it, expect } from "vitest";
import { createApp } from "../apps/api/src/app.js";
import { DemoStore, DEMO_ADDRESS, DEMO_HASH } from "@arcledger/database";
const app = createApp(new DemoStore());
describe("Ledger API", () => {
  it("identifies demo mode and unrun validation honestly", async () => {
    const r = await app.request("/v1/status");
    const s = await r.json();
    expect(s.mode).toBe("demo");
    expect(s.accountingMismatches).toBeNull();
    expect(s.canonicalTransfers).toBe(3);
  });
  it("provides exact totals with stable pagination", async () => {
    const r = await app.request(`/v1/addresses/${DEMO_ADDRESS}?limit=1`);
    const body = await r.json();
    expect(body.transactions).toHaveLength(1);
    expect(body.nextOffset).toBe(1);
    expect(body.received).toBe("185000000000000000000");
    expect(body.sent).toBe("10000000000000000000");
    expect(body.balance).toBe("174999580000000000000");
  });
  it("returns evidence for explain", async () => {
    const r = await app.request(`/v1/transactions/${DEMO_HASH}`);
    const body = await r.json();
    expect(body.movements).toHaveLength(1);
    expect(body.evidence).toHaveLength(2);
  });
  it("rejects invalid identifiers and pagination", async () => {
    for (const path of [
      "/v1/addresses/nope",
      "/v1/transactions/0x123",
      `/v1/addresses/${DEMO_ADDRESS}?limit=0`,
      `/v1/addresses/${DEMO_ADDRESS}?offset=-1`,
      `/v1/addresses/${DEMO_ADDRESS}?limit=NaN`,
      `/v1/addresses/${DEMO_ADDRESS}?offset=9007199254740993`,
    ])
      expect((await app.request(path)).status).toBe(400);
  });
  it("returns a clear unknown transaction response", async () => {
    expect(
      (await app.request(`/v1/transactions/0x${"ff".repeat(32)}`)).status,
    ).toBe(404);
  });
  it("injects a block-pinned balance without changing indexed totals", async () => {
    const live = createApp(new DemoStore(), async () => ({
      value: 123n,
      block: 500n,
    }));
    const body = await (
      await live.request(`/v1/addresses/${DEMO_ADDRESS}`)
    ).json();
    expect(body.balance).toBe("123");
    expect(body.balanceBlock).toBe("500");
    expect(body.transactionCount).toBe(3);
  });
});
