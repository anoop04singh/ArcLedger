import { describe, it, expect } from "vitest";
import {
  ArcAccountingAdapter,
  toNativeUnits,
  toErc20Units,
  formatUSDC,
} from "@arcledger/normalizer";
import { ARC_MAINNET as ARC } from "@arcledger/arc-config";
import type { AccountingInput, Hex, RawLog } from "@arcledger/types";
const A = `0x${"11".repeat(20)}` as Hex,
  B = `0x${"22".repeat(20)}` as Hex;
export const HASH = `0x${"ab".repeat(32)}` as Hex;
export function log(
  source: "native" | "erc20",
  amount: bigint,
  index: number,
  from: Hex = A,
  to: Hex = B,
): RawLog {
  return {
    address: source === "native" ? ARC.systemEmitter : ARC.usdc,
    topics: [
      ARC.transferTopic,
      `0x${from.slice(2).padStart(64, "0")}`,
      `0x${to.slice(2).padStart(64, "0")}`,
    ],
    data: `0x${amount.toString(16).padStart(64, "0")}`,
    logIndex: index,
  };
}
export function input(logs: RawLog[] = []): AccountingInput {
  return {
    hash: HASH,
    blockNumber: "1",
    blockHash: `0x${"01".repeat(32)}`,
    timestamp: "2026-09-17T10:00:00.000Z",
    sender: A,
    status: "success",
    gasUsed: 21000n,
    effectiveGasPrice: 20000000000n,
    logs,
  };
}
const adapter = new ArcAccountingAdapter();
describe("Arc accounting", () => {
  it("normalizes a native-only 1 USDC transfer with exact 18/6 unit equivalence", () => {
    const tx = adapter.explain(input([log("native", 10n ** 18n, 0)]));
    expect(tx.movements).toHaveLength(1);
    expect(toNativeUnits(1_000_000n)).toBe(1_000_000_000_000_000_000n);
    expect(formatUSDC(tx.movements[0].amount, 6)).toBe("1.000000");
  });
  it.each([A, B])(
    "keeps different amounts separate when the second recipient is %s",
    (recipient) => {
      const tx = adapter.explain(
        input([
          log("native", 10n ** 18n, 0),
          log("erc20", 10n ** 6n, 1),
          log("native", 2n * 10n ** 18n, 2, A, recipient),
          log("erc20", 2n * 10n ** 6n, 3, A, recipient),
        ]),
      );
      expect(tx.movements.map((m) => m.amount)).toEqual([
        "1000000000000000000",
        "2000000000000000000",
      ]);
      expect(tx.movements.map((m) => m.evidence)).toEqual([
        [0, 1],
        [2, 3],
      ]);
    },
  );
  it("matches dual representations into exactly one $10 movement", () => {
    const tx = adapter.explain(
      input([log("native", 10n ** 19n, 0), log("erc20", 10n ** 7n, 1)]),
    );
    expect(tx.movements).toHaveLength(1);
    expect(tx.movements[0].amount).toBe("10000000000000000000");
    expect(tx.movements[0].evidence).toEqual([0, 1]);
    expect(tx.fee).toBe("420000000000000");
  });
  it("preserves repeated identical transfers with one-to-one matching", () => {
    const tx = adapter.explain(
      input([
        log("native", 10n ** 18n, 0),
        log("native", 10n ** 18n, 1),
        log("erc20", 10n ** 6n, 2),
        log("erc20", 10n ** 6n, 3),
      ]),
    );
    expect(tx.movements).toHaveLength(2);
    expect(tx.movements.map((m) => m.evidence)).toEqual([
      [0, 2],
      [1, 3],
    ]);
  });
  it("does not collapse repeated native-only transfers", () => {
    expect(
      adapter.explain(input([log("native", 1n, 0), log("native", 1n, 1)]))
        .movements,
    ).toHaveLength(2);
  });
  it("does not merge different participants or amounts", () => {
    const tx = adapter.explain(
      input([
        log("native", 10n ** 18n, 0),
        log("erc20", 2n * 10n ** 6n, 1),
        log("erc20", 10n ** 6n, 2, B, A),
      ]),
    );
    expect(tx.warnings).toHaveLength(2);
    expect(tx.movements).toHaveLength(1);
  });
  it("surfaces ERC-20-only evidence without inventing a movement", () => {
    const tx = adapter.explain(input([log("erc20", 10n ** 6n, 0)]));
    expect(tx.movements).toHaveLength(0);
    expect(tx.evidence[0].disposition).toBe("unmatched");
    expect(tx.warnings).toHaveLength(1);
  });
  it("ignores approvals and unrelated emitters", () => {
    const unrelated = { ...log("native", 1n, 0), address: B };
    const approval = { ...log("native", 1n, 1), topics: [HASH] };
    expect(adapter.explain(input([unrelated, approval])).evidence).toEqual([]);
  });
  it("keeps gas even on failed transactions", () => {
    const tx = adapter.explain({ ...input(), status: "reverted" });
    expect(tx.movements).toEqual([]);
    expect(tx.fee).toBe("420000000000000");
    expect(() =>
      adapter.explain({ ...input([log("native", 1n, 0)]), status: "reverted" }),
    ).toThrow(/Reverted/);
  });
  it("attributes token sender independently from a relayer", () => {
    const tx = adapter.explain({ ...input([log("native", 1n, 0)]), sender: B });
    expect(tx.movements[0].from).toBe(A);
    expect(tx.sender).toBe(B);
  });
  it("maps mint and burn", () => {
    const tx = adapter.explain(
      input([
        log("native", 1n, 0, ARC.zeroAddress, A),
        log("native", 1n, 1, A, ARC.zeroAddress),
      ]),
    );
    expect(tx.movements.map((m) => m.kind)).toEqual(["mint", "burn"]);
  });
  it("retains dust through conversion and display", () => {
    const n = 1234567890123456789n;
    const split = toErc20Units(n);
    expect(toNativeUnits(split.units) + split.remainder).toBe(n);
    expect(formatUSDC(1n)).toBe("0.000000000000000001");
    expect(formatUSDC(10n ** 19n)).toBe("10.00");
    expect(adapter.normalizeBalance(n)).toBe(n);
  });
  it("supports integers well beyond JavaScript number precision", () => {
    const amount = (1n << 255n) - 1n;
    expect(
      adapter.explain(input([log("native", amount, 0)])).movements[0].amount,
    ).toBe(amount.toString());
  });
  it("retains one self transfer and ignores zero representations", () => {
    const tx = adapter.explain(
      input([
        log("erc20", 0n, 0),
        log("native", 10n ** 18n, 1, A, A),
        log("erc20", 10n ** 6n, 2, A, A),
      ]),
    );
    expect(tx.movements).toHaveLength(1);
    expect(tx.movements[0]).toMatchObject({
      kind: "self",
      from: A,
      to: A,
      evidence: [1, 2],
    });
    expect(tx.warnings).toEqual([]);
    expect(tx.evidence[0].disposition).toBe("no-movement");
  });
  it("rejects malformed, removed, and duplicate receipt evidence", () => {
    expect(() =>
      adapter.explain(input([{ ...log("native", 1n, 0), data: "0x01" }])),
    ).toThrow(/Malformed/);
    expect(() =>
      adapter.explain(input([{ ...log("native", 1n, 0), removed: true }])),
    ).toThrow(/Removed/);
    expect(() =>
      adapter.explain(input([log("native", 1n, 0), log("native", 1n, 0)])),
    ).toThrow(/Duplicate/);
  });
  it("rejects negative amounts and invalid input", () => {
    expect(() => toNativeUnits(-1n)).toThrow();
    expect(() =>
      adapter.calculateFee({ gasUsed: -1n, effectiveGasPrice: 1n }),
    ).toThrow();
    expect(() => adapter.explain({})).toThrow();
  });
});
