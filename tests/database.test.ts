import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  migrate,
  commitRawBlock,
  saveRawBlock,
  checkpoint,
  PostgresStore,
  projectPending,
} from "@arcledger/database";
import { createApp } from "../apps/api/src/app.js";
import { fixture, A, hash } from "./fixtures.js";
import { demoTransactions } from "../packages/database/src/demo.js";
it("stores full raw data and exact failed-transaction fees atomically; replay is idempotent", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    await migrate(db);
    const b = fixture();
    await commitRawBlock(db, b, b.number);
    await commitRawBlock(db, b, b.number);
    expect((await checkpoint(db))?.last_processed_block).toBe("100");
    const {
      rows: [counts],
    } = await db.query(
      "SELECT (SELECT count(*)::int FROM blocks) blocks,(SELECT count(*)::int FROM transactions) txs,(SELECT count(*)::int FROM raw_events) logs,(SELECT count(*)::int FROM transfers) transfers",
    );
    expect(counts).toEqual({ blocks: 1, txs: 2, logs: 3, transfers: 0 });
    const {
      rows: [stored],
    } = await db.query(
      "SELECT raw_receipt,fee_raw,status,to_address FROM transactions WHERE transaction_index=1",
    );
    expect(stored).toMatchObject({
      fee_raw: "420000000000000",
      status: "reverted",
      to_address: null,
    });
    expect((stored as { raw_receipt: unknown }).raw_receipt).toEqual(
      b.transactions[1].receipt,
    );
    const {
      rows: [unknown],
    } = await db.query(
      "SELECT topics,topic0,data,raw_log FROM raw_events WHERE log_index=2",
    );
    expect(unknown).toMatchObject({
      topics: [],
      topic0: null,
      data: "0x1234",
      raw_log: b.logs[2],
    });
    const store = new PostgresStore(db);
    expect((await store.status()).pendingNormalization).toBe(2);
    expect(
      (
        await createApp(store).request(
          `/v1/tx/${b.transactions[0].transaction.hash}`,
        )
      ).status,
    ).toBe(409);
    const response = await createApp(store).request(
      `/v1/tx/${b.transactions[0].transaction.hash}?includeRaw=true`,
    );
    expect(response.status).toBe(409);
    expect((await response.json()).raw.raw_transaction).toEqual(
      b.transactions[0].transaction,
    );
    await projectPending(db);
    await projectPending(db);
    expect((await store.status()).canonicalTransfers).toBe(1);
    expect((await store.status()).pendingNormalization).toBe(0);
    expect((await store.address(A, 20, 0)).sent).toBe("10000000000000000000");
    expect(
      (await db.query("SELECT count(*)::int n FROM address_entries")).rows[0],
    ).toEqual({ n: 3 });
    expect(
      (await store.rawTransaction(b.transactions[0].transaction.hash)) !== null,
    ).toBe(true);
  } finally {
    await db.close();
  }
}, 30000);
it("rolls back partial writes and resumes contiguous blocks, rejects conflicting history", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const b = fixture();
    let injected = false;
    const failing = {
      query: async (text: string, values?: unknown[]) => {
        if (text.includes("INSERT INTO raw_events") && !injected) {
          injected = true;
          throw new Error("simulated worker crash");
        }
        return db.query(text, values);
      },
    };
    await expect(commitRawBlock(failing, b, b.number)).rejects.toThrow(
      "simulated worker crash",
    );
    expect(await checkpoint(db)).toBeUndefined();
    expect(
      (await db.query("SELECT count(*)::int n FROM blocks")).rows[0],
    ).toEqual({ n: 0 });
    await commitRawBlock(db, b, b.number);
    await commitRawBlock(db, fixture(101), "101");
    await expect(
      commitRawBlock(db, { ...b, hash: hash(900) }, "101"),
    ).rejects.toThrow(/conflict/);
    await expect(commitRawBlock(db, fixture(103), "103")).rejects.toThrow(
      /Non-contiguous/,
    );
    expect((await checkpoint(db))?.last_processed_block).toBe("101");
  } finally {
    await db.close();
  }
}, 30000);
it("normalizer rejection leaves raw data and checkpoint intact", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const b = fixture();
    b.logs[0].data = "0x01";
    await commitRawBlock(db, b, b.number);
    expect(await projectPending(db)).toEqual({ projected: 1, failed: 1 });
    expect((await checkpoint(db))?.last_processed_block).toBe("100");
    expect(
      (await db.query("SELECT raw_log FROM raw_events WHERE log_index=0"))
        .rows[0],
    ).toMatchObject({ raw_log: { data: "0x01" } });
  } finally {
    await db.close();
  }
}, 30000);
it("upgrades an existing Part 1 database without claiming missing historical raw data", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      await readFile(
        new URL("../packages/database/src/schema.sql", import.meta.url),
        "utf8",
      ),
    );
    const t = demoTransactions()[0];
    await db.query("INSERT INTO blocks VALUES($1,$2,$3,$4)", [
      t.blockNumber,
      t.blockHash,
      hash(0),
      t.timestamp,
    ]);
    await db.query("INSERT INTO transactions VALUES($1,$2,$3,$4,$5)", [
      t.hash,
      t.blockNumber,
      t.sender,
      t.fee,
      JSON.stringify(t),
    ]);
    await db.query(
      "INSERT INTO indexer_state(id,start_block,latest_block,finalized_head) VALUES(1,$1,$1,$1)",
      [t.blockNumber],
    );
    await migrate(db);
    await migrate(db);
    expect((await checkpoint(db))?.last_processed_block).toBe(t.blockNumber);
    expect(await new PostgresStore(db).transaction(t.hash)).toEqual(t);
    await projectPending(db);
    const entries = await new PostgresStore(db).ledger(t.sender, 50);
    expect(entries.entries).toHaveLength(1);
    expect(entries.entries[0].netChange).toBe(
      (-BigInt(t.movements[0].amount) - BigInt(t.fee)).toString(),
    );
    expect(
      (await db.query("SELECT raw_complete,raw_block FROM blocks")).rows[0],
    ).toEqual({ raw_complete: false, raw_block: null });
    expect(
      (
        await db.query(
          "SELECT count(*)::int n FROM information_schema.tables WHERE table_name IN ('blocks','transactions','raw_events','transfers','address_entries','indexer_state','webhooks','webhook_deliveries')",
        )
      ).rows[0],
    ).toEqual({ n: 8 });
  } finally {
    await db.close();
  }
}, 30000);
