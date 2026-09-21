import { beforeAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import {
  migrate,
  commitRawBlock,
  projectPending,
  PostgresStore,
} from "@arcledger/database";
import { fixture, A, hash } from "./fixtures.js";
import {
  readValidationSnapshot,
  validateSnapshot,
  type ValidationSnapshot,
} from "../scripts/lib/validation.js";
import { saveValidation } from "../packages/database/src/validation.js";
import { createApp } from "../apps/api/src/app.js";
let snapshot: ValidationSnapshot;
const raw = fixture();
beforeAll(async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    await commitRawBlock(db, raw, raw.number);
    await projectPending(db);
    snapshot = await readValidationSnapshot(db, "100", "100");
  } finally {
    await db.close();
  }
}, 30000);
it("independently validates canonical movements, raw preservation, decimals and receipt fees", () => {
  expect(validateSnapshot([raw], snapshot, "100", "100")).toMatchObject({
    status: "valid",
    transactions: 2,
    rawRecords: 2,
    canonicalMovements: 1,
    duplicateRecords: 1,
    feeMismatches: 0,
    accountingMismatches: 0,
  });
});
it.each([
  [
    "fee",
    (s: ValidationSnapshot): unknown => (s.transactions[0].fee_raw = "1"),
  ],
  [
    "canonical amount",
    (s: ValidationSnapshot): unknown => (s.transfers[0].amount = "1"),
  ],
  [
    "participants",
    (s: ValidationSnapshot): unknown => (s.transfers[0].to_address = A),
  ],
  [
    "net change",
    (s: ValidationSnapshot): unknown => (s.entries[0].net_change = "0"),
  ],
  ["missing raw event", (s: ValidationSnapshot): unknown => s.events.pop()],
  [
    "missing transaction",
    (s: ValidationSnapshot): unknown => s.transactions.pop(),
  ],
  ["missing block", (s: ValidationSnapshot): unknown => s.blocks.pop()],
  [
    "duplicate match",
    (s: ValidationSnapshot): unknown =>
      (s.transactions[0].explanation.movements[0].evidence = [0, 2]),
  ],
  [
    "evidence decimals",
    (s: ValidationSnapshot): unknown =>
      (s.transactions[0].explanation.evidence[1].decimals = 18),
  ],
  ["ledger missing", (s: ValidationSnapshot): unknown => s.entries.pop()],
] as const)("detects corrupted %s", (_name, change) => {
  const s = structuredClone(snapshot);
  change(s);
  expect(validateSnapshot([raw], s, "100", "100").status).toBe("invalid");
});
it("rejects empty or incomplete validation samples", () => {
  expect(
    validateSnapshot(
      [],
      { blocks: [], transactions: [], events: [], transfers: [], entries: [] },
      "100",
      "100",
    ).status,
  ).toBe("invalid");
  expect(validateSnapshot([raw], snapshot, "100", "101").status).toBe(
    "invalid",
  );
});
it("persists validation and self transfers exactly once through block replay", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const b = fixture();
    b.logs[0].topics[2] = hash(BigInt(A));
    b.logs[1].topics[2] = hash(BigInt(A));
    b.logs = b.logs.filter((l) => l.logIndex !== "0x0");
    b.transactions[0].receipt.logs = b.logs;
    await commitRawBlock(db, b, "100");
    await projectPending(db);
    const before = await readValidationSnapshot(db, "100", "100");
    await commitRawBlock(db, b, "100");
    await projectPending(db);
    expect(await readValidationSnapshot(db, "100", "100")).toEqual(before);
    expect(before.transfers).toHaveLength(1);
    expect(before.entries.filter((x) => x.address === A)).toMatchObject([
      { entry_type: "self", gross_change: "0", net_change: "-420000000000000" },
    ]);
    const report = validateSnapshot([b], before, "100", "100");
    expect(report.status).toBe("valid");
    await saveValidation(db, {
      ...report,
      startedAt: new Date().toISOString(),
      startBlock: "100",
      endBlock: "100",
      scope: "Test sample",
    });
    expect(await new PostgresStore(db).status()).toMatchObject({
      validation: "valid",
      accountingMismatches: 0,
      validationRun: { startBlock: "100", endBlock: "100" },
    });
    expect(await new PostgresStore(db).address(A, 50, 0)).toMatchObject({
      received: "0",
      sent: "0",
    });
  } finally {
    await db.close();
  }
}, 30000);
it("reports a healthy database separately when Arc RPC is unavailable", async () => {
  const db = new PGlite();
  try {
    await migrate(db);
    const app = createApp(new PostgresStore(db), undefined, {
      head: async () => {
        throw new Error("RPC down");
      },
    });
    const response = await app.request("/v1/status");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      database: "healthy",
      rpc: "unavailable",
      status: "degraded",
      latestChainBlock: null,
      lag: null,
    });
  } finally {
    await db.close();
  }
}, 30000);
