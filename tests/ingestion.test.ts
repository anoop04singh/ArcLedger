import { it, expect } from "vitest";
import { ArcRpc, ARC_MAINNET } from "@arcledger/arc-config";
import { readRawBlock } from "../apps/indexer/src/ingest.js";
import { fixture, mockRpc, qty } from "./fixtures.js";
it("tries the primary first, verifies both chains, and falls back on failure or null", async () => {
  const order: string[] = [];
  let fail = true;
  const endpoint =
    (name: string) =>
    async ({ method }: { method: string }) => {
      order.push(`${name}:${method}`);
      if (method === "eth_chainId") return qty(ARC_MAINNET.chainId);
      if (name === "primary" && fail) throw new Error("offline");
      return "0x64";
    };
  const rpc = new ArcRpc(endpoint("primary"), endpoint("fallback"));
  expect(await rpc.blockNumber()).toBe(100n);
  expect(order).toEqual([
    "primary:eth_chainId",
    "primary:eth_blockNumber",
    "fallback:eth_chainId",
    "fallback:eth_blockNumber",
  ]);
  fail = false;
  expect(await rpc.blockNumber()).toBe(100n);
  expect(order.at(-1)).toBe("primary:eth_blockNumber");
  expect(rpc.metrics.failovers).toBe(1);
  const nullRpc = new ArcRpc(
    async ({ method }) =>
      method === "eth_chainId" ? qty(ARC_MAINNET.chainId) : null,
    endpoint("fallback"),
  );
  expect(await nullRpc.blockNumber()).toBe(100n);
});
it("never accepts a fallback on the wrong network", async () => {
  const rpc = new ArcRpc(
    async () => {
      throw new Error("offline");
    },
    async () => "0x1",
  );
  await expect(rpc.blockNumber()).rejects.toThrow("not Arc Mainnet");
});
it("captures all six required methods without normalizing protocol logs", async () => {
  const methods = new Set<string>();
  const rpc = mockRpc([fixture()], (request) => {
    methods.add(request.method);
  });
  expect(await rpc.blockNumber()).toBe(100n);
  const b = await readRawBlock(rpc, 100n);
  expect(b.transactions).toHaveLength(2);
  expect(b.logs).toHaveLength(3);
  expect(b.transactions[0].transaction.customTransactionField).toEqual({
    test: true,
  });
  expect(b.raw.extraHeader).toBe("retained");
  await rpc.balance(b.transactions[0].transaction.from, 100n);
  for (const method of [
    "eth_blockNumber",
    "eth_getBlockByNumber",
    "eth_getTransactionByHash",
    "eth_getTransactionReceipt",
    "eth_getLogs",
    "eth_getBalance",
  ])
    expect(methods.has(method)).toBe(true);
});
it("rejects missing, duplicate, removed or inconsistent provider logs before checkpointing", async () => {
  const b = fixture();
  await expect(
    readRawBlock(
      mockRpc([b], (r) => (r.method === "eth_getLogs" ? [] : undefined)),
      100n,
    ),
  ).rejects.toThrow(/disagree/);
  b.logs[0].removed = true;
  await expect(readRawBlock(mockRpc([b]), 100n)).rejects.toThrow(/snapshot/);
  const duplicate = fixture();
  duplicate.logs.push(duplicate.logs[0]);
  await expect(readRawBlock(mockRpc([duplicate]), 100n)).rejects.toThrow(
    /Duplicate log/,
  );
  const bad = fixture();
  bad.transactions[0].receipt.blockNumber = "0x63";
  await expect(readRawBlock(mockRpc([bad]), 100n)).rejects.toThrow(/snapshot/);
});
