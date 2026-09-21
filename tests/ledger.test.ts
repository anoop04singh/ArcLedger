import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  normalizeArcTransaction,
  constructAddressEntries,
  publicEntry,
} from "@arcledger/normalizer";
import {
  migrate,
  commitRawBlock,
  projectPending,
  PostgresStore,
} from "@arcledger/database";
import { createApp } from "../apps/api/src/app.js";
import { fixture, A, B, hash } from "./fixtures.js";
import { ARC_MAINNET } from "@arcledger/arc-config";
import type { Hex, Movement } from "@arcledger/types";
const C = `0x${"33".repeat(20)}` as Hex;
const base = () =>
  normalizeArcTransaction({
    receipt: fixture().transactions[0].receipt,
    timestamp: fixture().timestamp,
  });
const movement = (
  from: Hex,
  to: Hex,
  amount: string,
  id: number,
  kind: Movement["kind"] = "transfer",
): Movement => ({ id: `m:${id}`, from, to, amount, kind, evidence: [id] });
it("normalizes receipt inputs with separate fee and duplicate evidence", () => {
  const tx = base();
  expect(tx.movements).toHaveLength(1);
  expect(tx.duplicates).toHaveLength(1);
  expect(tx.fee).toBe("420000000000000");
  const [out, incoming] = constructAddressEntries({
    ...tx,
    fee: "31000000000000",
  }).map(publicEntry);
  expect(out).toMatchObject({
    amount: "10.000000",
    fee: "0.000031",
    grossChange: "-10.000000",
    netChange: "-10.000031",
    counterparty: B,
  });
  expect(incoming).toMatchObject({
    fee: "0",
    grossChange: "10.000000",
    netChange: "10.000000",
  });
});
it("charges sender exactly once across multiple outgoing/incoming movements and preserves dust", () => {
  const tx = {
    ...base(),
    fee: "1",
    movements: [
      movement(A, B, "10000000000000000000", 0),
      movement(A, C, "3", 1),
      movement(B, A, "7", 2),
    ],
  };
  const entries = constructAddressEntries(tx).filter((e) => e.address === A);
  expect(entries.filter((e) => e.fee !== "0")).toHaveLength(1);
  expect(entries.reduce((n, e) => n + BigInt(e.netChange), 0n)).toBe(
    -10000000000000000000n + 3n,
  );
  expect(publicEntry(entries[1]).amount).toBe("0.000000000000000003");
});
it("charges a relayer without charging token owners or recipients", () => {
  const entries = constructAddressEntries({ ...base(), sender: C });
  expect(entries.find((e) => e.address === A)?.fee).toBe("0");
  expect(entries.find((e) => e.address === B)?.fee).toBe("0");
  expect(entries.find((e) => e.address === C)).toMatchObject({
    type: "network_fee",
    amount: "0",
    grossChange: "0",
    netChange: "-420000000000000",
    counterparty: null,
  });
});
it("keeps failed and approval-only fees, and one self transfer with zero gross change", () => {
  const b = fixture();
  const failed = normalizeArcTransaction({
    receipt: b.transactions[1].receipt,
    timestamp: b.timestamp,
  });
  expect(constructAddressEntries(failed)).toMatchObject([
    {
      status: "reverted",
      type: "network_fee",
      grossChange: "0",
      netChange: "-420000000000000",
    },
  ]);
  expect(constructAddressEntries({ ...base(), movements: [] })).toMatchObject([
    { address: A, type: "network_fee", amount: "0" },
  ]);
  expect(
    constructAddressEntries({
      ...base(),
      movements: [movement(A, A, "99", 0, "self")],
    }),
  ).toMatchObject([
    {
      address: A,
      type: "self",
      amount: "99",
      grossChange: "0",
      netChange: "-420000000000000",
    },
  ]);
});
it("handles mint/burn without creating zero-address account entries", () => {
  const tx = {
    ...base(),
    movements: [
      movement(ARC_MAINNET.zeroAddress, A, "5", 0, "mint"),
      movement(A, ARC_MAINNET.zeroAddress, "2", 1, "burn"),
    ],
  };
  const entries = constructAddressEntries(tx);
  expect(entries).toHaveLength(2);
  expect(entries.every((e) => e.address === A)).toBe(true);
  expect(entries.reduce((n, e) => n + BigInt(e.netChange), 0n)).toBe(
    3n - BigInt(tx.fee),
  );
});
it("persists exact ledger rows, stable cursor snapshots, and idempotent projections", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const b = fixture();
    await commitRawBlock(db, b, b.number);
    await projectPending(db);
    const store = new PostgresStore(db),
      app = createApp(store, async () => ({ value: 9n, block: 101n }));
    const first = await (
      await app.request(`/v1/address/${B}/ledger?limit=1`)
    ).json();
    expect(first.entries[0]).toMatchObject({
      type: "network_fee",
      status: "reverted",
      blockNumber: 100,
    });
    const next = fixture(101);
    await commitRawBlock(db, next, "101");
    await projectPending(db);
    await projectPending(db);
    const second = await (
      await app.request(
        `/v1/address/${B}/ledger?limit=1&cursor=${first.nextCursor}`,
      )
    ).json();
    expect(second.entries[0]).toMatchObject({
      type: "transfer",
      direction: "incoming",
      blockNumber: 100,
    });
    expect(second.nextCursor).toBeNull();
    const fresh = await (await app.request(`/v1/address/${B}/ledger`)).json();
    expect(fresh.entries).toHaveLength(4);
    expect(fresh.entries[0].blockNumber).toBe(101);
    const summary = await (await app.request(`/v1/address/${B}`)).json();
    expect(summary).toMatchObject({
      transactions: 4,
      received: "20.000000",
      sent: "0.000000",
      feesPaid: "0.000840",
      balance: "0.000000000000000009",
    });
    expect(
      (await db.query("SELECT count(*)::int n FROM address_entries")).rows[0],
    ).toEqual({ n: 6 });
    const raw = await (
      await app.request(
        `/v1/tx/${b.transactions[0].transaction.hash}?includeRaw=true`,
      )
    ).json();
    expect(raw.raw.raw_receipt).toEqual(b.transactions[0].receipt);
  } finally {
    await db.close();
  }
}, 30000);
it("excludes late projections from existing cursors and includes them in a fresh query", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const b = fixture();
    await commitRawBlock(db, b, b.number);
    await projectPending(db, 1);
    const store = new PostgresStore(db);
    const snapshot = (await store.ledger(B, 50)).snapshot;
    await projectPending(db, 1);
    expect((await store.ledger(B, 50, snapshot)).entries).toHaveLength(1);
    expect((await store.ledger(B, 50)).entries).toHaveLength(2);
  } finally {
    await db.close();
  }
}, 30000);
it("rolls back a failed ledger projection and retries without duplicate entries", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const b = fixture();
    await commitRawBlock(db, b, b.number);
    let fail = true;
    await expect(
      projectPending({
        query: async (sql, values) => {
          if (sql.includes("INSERT INTO address_entries") && fail) {
            fail = false;
            throw new Error("interrupted");
          }
          return db.query(sql, values);
        },
      }),
    ).rejects.toThrow("interrupted");
    expect(
      (await db.query("SELECT count(*)::int n FROM address_entries")).rows[0],
    ).toEqual({ n: 0 });
    expect(
      (
        await db.query(
          "SELECT ledger_version FROM transactions WHERE tx_hash=$1",
          [hash(10000)],
        )
      ).rows[0],
    ).toEqual({ ledger_version: 0 });
    await projectPending(db);
    expect((await new PostgresStore(db).ledger(A, 50)).entries).toHaveLength(1);
  } finally {
    await db.close();
  }
}, 30000);

it("paginates repeated movements within one transaction without skips or duplicated fees", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const b = fixture();
    b.logs.push({ ...b.logs[0], logIndex: "0x3", data: hash(1) });
    await commitRawBlock(db, b, b.number);
    await projectPending(db);
    const app = createApp(new PostgresStore(db));
    const ids: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await (
        await app.request(
          `/v1/address/${B}/ledger?limit=1${cursor ? "&cursor=" + cursor : ""}`,
        )
      ).json();
      ids.push(...page.entries.map((e: any) => e.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    const entries = (await new PostgresStore(db).ledger(A, 100)).entries;
    expect(entries).toHaveLength(2);
    expect(entries.reduce((sum, e) => sum + BigInt(e.fee), 0n)).toBe(
      420000000000000n,
    );
  } finally {
    await db.close();
  }
}, 30000);
