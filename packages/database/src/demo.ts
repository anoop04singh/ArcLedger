import { ARC_MAINNET as ARC } from "@arcledger/arc-config";
import {
  ArcAccountingAdapter,
  constructAddressEntries,
} from "@arcledger/normalizer";
import type {
  AddressLedger,
  Hex,
  LedgerStatus,
  RawLog,
  LedgerPosition,
} from "@arcledger/types";
import type { LedgerStore } from "./index.js";
export const DEMO_ADDRESS = "0x91bd00000000000000000000000000000000a821" as Hex;
const OTHER = "0xf920000000000000000000000000000000000028" as Hex;
export const DEMO_HASH = `0x${"a2".repeat(32)}` as Hex;
function log(
  source: "native" | "erc20",
  from: Hex,
  to: Hex,
  amount: bigint,
  logIndex: number,
): RawLog {
  return {
    address: source === "native" ? ARC.systemEmitter : ARC.usdc,
    topics: [
      ARC.transferTopic,
      `0x${from.slice(2).padStart(64, "0")}`,
      `0x${to.slice(2).padStart(64, "0")}`,
    ],
    data: `0x${amount.toString(16).padStart(64, "0")}`,
    logIndex,
  };
}
export function demoTransactions() {
  return [
    {
      hash: DEMO_HASH,
      from: DEMO_ADDRESS,
      to: OTHER,
      amount: 10n,
      block: 291294,
    },
    {
      hash: `0x${"b3".repeat(32)}` as Hex,
      from: OTHER,
      to: DEMO_ADDRESS,
      amount: 25n,
      block: 291293,
    },
    {
      hash: `0x${"c4".repeat(32)}` as Hex,
      from: OTHER,
      to: DEMO_ADDRESS,
      amount: 160n,
      block: 291292,
    },
  ].map((t, i) =>
    new ArcAccountingAdapter().explain({
      hash: t.hash,
      blockNumber: String(t.block),
      blockHash: `0x${String(i + 1).repeat(64)}`,
      timestamp: new Date(Date.UTC(2026, 8, 17, 10, 30 - i * 4)).toISOString(),
      sender: t.from,
      status: "success",
      gasUsed: 21000n,
      effectiveGasPrice: 20000000000n,
      logs: [
        log("native", t.from, t.to, t.amount * 10n ** 18n, 0),
        log("erc20", t.from, t.to, t.amount * 10n ** 6n, 1),
      ],
    }),
  );
}
export class DemoStore implements LedgerStore {
  mode = "demo" as const;
  readonly transactions = demoTransactions();
  async ledger(
    address: Hex,
    limit: number,
    snapshot = "3",
    after?: LedgerPosition,
  ) {
    const entries = this.transactions
      .slice(0, Number(snapshot))
      .flatMap((t) => constructAddressEntries(t))
      .filter((e) => e.address === address)
      .sort(
        (a, b) =>
          Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)) ||
          b.transactionIndex - a.transactionIndex ||
          b.txHash.localeCompare(a.txHash) ||
          b.entryIndex - a.entryIndex,
      )
      .filter(
        (e) =>
          !after ||
          BigInt(e.blockNumber) < BigInt(after.block) ||
          (e.blockNumber === after.block &&
            (e.transactionIndex < after.transactionIndex ||
              (e.transactionIndex === after.transactionIndex &&
                (e.txHash < after.hash ||
                  (e.txHash === after.hash &&
                    e.entryIndex < after.entryIndex))))),
      );
    return {
      entries: entries.slice(0, limit),
      snapshot,
      hasMore: entries.length > limit,
    };
  }
  async transaction(hash: string) {
    return this.transactions.find((t) => t.hash === hash) ?? null;
  }
  async address(
    address: Hex,
    limit: number,
    offset: number,
  ): Promise<AddressLedger> {
    const txs = this.transactions.filter(
      (t) =>
        t.sender === address ||
        t.movements.some((m) => m.from === address || m.to === address),
    );
    let received = 0n,
      sent = 0n,
      fees = 0n;
    for (const tx of txs) {
      if (tx.sender === address) fees += BigInt(tx.fee);
      for (const m of tx.movements) {
        if (m.to === address && m.from !== m.to) received += BigInt(m.amount);
        if (m.from === address && m.from !== m.to) sent += BigInt(m.amount);
      }
    }
    return {
      address,
      mode: this.mode,
      balance:
        address === DEMO_ADDRESS ? (received - sent - fees).toString() : null,
      balanceBlock: address === DEMO_ADDRESS ? "291294" : null,
      received: received.toString(),
      sent: sent.toString(),
      feesPaid: fees.toString(),
      transactionCount: txs.length,
      transactions: txs.slice(offset, offset + limit),
      nextOffset: offset + limit < txs.length ? offset + limit : null,
      coverageStart: "291292",
    };
  }
  async status(): Promise<LedgerStatus> {
    return {
      mode: this.mode,
      state: "demo",
      chainId: ARC.chainId,
      latestIndexedBlock: "291294",
      latestFinalizedBlock: "291294",
      lag: "0",
      startBlock: "291292",
      updatedAt: null,
      canonicalTransfers: 3,
      duplicatesRemoved: 3,
      normalizationWarnings: 0,
      accountingMismatches: null,
      validation: "not-run",
    };
  }
}
