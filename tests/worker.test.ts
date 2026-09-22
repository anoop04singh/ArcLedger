import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { migrate, checkpoint, projectPending } from "@arcledger/database";
import { readIndexerOptions, runIndexer } from "../apps/indexer/src/worker.js";
import { fixture, mockRpc } from "./fixtures.js";
it("validates indexer configuration and defaults to head instead of genesis", () => {
  expect(readIndexerOptions({}).startBlock).toBeUndefined();
  expect(readIndexerOptions({}).pollMs).toBe(250);
  expect(readIndexerOptions({ INDEX_START_BLOCK: "190000" }).startBlock).toBe(
    190000n,
  );
  expect(() => readIndexerOptions({ INDEX_START_BLOCK: "-1" })).toThrow();
  expect(() => readIndexerOptions({ INDEXER_BLOCK_PREFETCH: "0" })).toThrow();
});
it("retries an RPC outage, resumes from checkpoint after restart and never duplicates rows", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    let failed = false,
      retries = 0;
    const options = {
      ...readIndexerOptions({}),
      startBlock: 100n,
      pollMs: 100,
      retryMs: 100,
    };
    const rpc = mockRpc([fixture(100), fixture(101), fixture(102)], (r) => {
      if (r.method === "eth_getTransactionReceipt" && !failed) {
        failed = true;
        throw new Error("RPC failure");
      }
    });
    const connect = async () => ({
      db,
      close: async () => {
        await db.query("SELECT pg_advisory_unlock(5042,1)");
      },
    });
    const first = new AbortController(),
      firstBlocks: string[] = [];
    await runIndexer({
      rpc,
      connect,
      options,
      signal: first.signal,
      onRetry: () => {
        retries++;
      },
      onProgress: (p) => {
        firstBlocks.push(p.block);
        first.abort();
      },
    });
    expect(firstBlocks).toEqual(["100"]);
    expect(retries).toBe(1);
    const second = new AbortController(),
      resumed: string[] = [];
    await runIndexer({
      rpc,
      connect,
      options: { ...options, startBlock: 0n },
      signal: second.signal,
      onProgress: (p) => {
        resumed.push(p.block);
        if (p.block === "102") second.abort();
      },
    });
    expect(resumed).toEqual(["101", "102"]);
    expect((await checkpoint(db))?.last_processed_block).toBe("102");
    expect(
      (await db.query("SELECT count(*)::int n FROM transactions")).rows[0],
    ).toEqual({ n: 6 });
  } finally {
    await db.close();
  }
}, 30000);
it("stops during an in-flight fetch and resumes without gaps or duplicate movements", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const blocks = [fixture(100), fixture(101)];
    const stop = new AbortController();
    let stopped = false;
    const rpc = mockRpc(blocks, (r) => {
      if (r.method === "eth_getTransactionReceipt" && !stopped) {
        stopped = true;
        stop.abort();
      }
    });
    const connect = async () => ({
      db,
      close: async () => {
        await db.query("SELECT pg_advisory_unlock(5042,1)");
      },
    });
    const options = { ...readIndexerOptions({}), startBlock: 100n };
    await runIndexer({ rpc, connect, options, signal: stop.signal });
    expect(stopped).toBe(true);
    expect(await checkpoint(db)).toBeUndefined();
    const resumed = new AbortController();
    await runIndexer({
      rpc: mockRpc(blocks),
      connect,
      options,
      signal: resumed.signal,
      onProgress: (p) => {
        if (p.block === "101") resumed.abort();
      },
    });
    await projectPending(db);
    await projectPending(db);
    expect((await checkpoint(db))?.last_processed_block).toBe("101");
    const {
      rows: [counts],
    } = await db.query(
      "SELECT (SELECT count(*)::int FROM blocks) blocks,(SELECT count(*)::int FROM transactions) transactions,(SELECT count(*)::int FROM transfers) transfers,(SELECT count(*)::int FROM address_entries) entries",
    );
    expect(counts).toEqual({
      blocks: 2,
      transactions: 4,
      transfers: 2,
      entries: 6,
    });
  } finally {
    await db.close();
  }
}, 30000);
it("a lost COMMIT acknowledgement reconnects and reads the committed checkpoint", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const rpc = mockRpc([fixture(100), fixture(101)]);
    let lost = false,
      retries = 0;
    const stop = new AbortController();
    const connect = async () => ({
      db: {
        query: async (text: string, values?: unknown[]) => {
          const result = await db.query(text, values);
          if (text.includes("public.arcledger_ingest(") && !lost) {
            lost = true;
            throw new Error("connection closed after COMMIT");
          }
          return result;
        },
      },
      close: async () => {
        await db.query("SELECT pg_advisory_unlock(5042,1)");
      },
    });
    const seen: string[] = [];
    await runIndexer({
      rpc,
      connect,
      options: { ...readIndexerOptions({}), startBlock: 100n, retryMs: 100 },
      signal: stop.signal,
      onRetry: () => {
        retries++;
      },
      onProgress: (p) => {
        seen.push(p.block);
        stop.abort();
      },
    });
    expect(seen).toEqual(["101"]);
    expect(retries).toBe(1);
    expect((await checkpoint(db))?.last_processed_block).toBe("101");
    expect(
      (await db.query("SELECT count(*)::int n FROM blocks")).rows[0],
    ).toEqual({ n: 2 });
  } finally {
    await db.close();
  }
}, 30000);
