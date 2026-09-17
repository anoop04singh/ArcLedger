import { z } from "zod";
import { ARC_MAINNET as ARC, DECIMAL_SCALE } from "@arcledger/arc-config";
import type {
  ChainAccountingAdapter,
  Evidence,
  ExplainedTransaction,
  Hex,
  Movement,
} from "@arcledger/types";
const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((v) => v.toLowerCase() as Hex);
const hash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((v) => v.toLowerCase() as Hex);
const inputSchema = z.object({
  hash,
  blockNumber: z.string().regex(/^\d+$/),
  blockHash: hash,
  timestamp: z.iso.datetime(),
  sender: address,
  status: z.enum(["success", "reverted"]),
  gasUsed: z.bigint().nonnegative(),
  effectiveGasPrice: z.bigint().nonnegative(),
  logs: z.array(
    z.object({
      address,
      topics: z.array(hash),
      data: z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/),
      logIndex: z.number().int().nonnegative(),
      removed: z.boolean().optional(),
    }),
  ),
});
export function toNativeUnits(value: bigint) {
  if (value < 0n) throw new Error("Negative amount");
  return value * DECIMAL_SCALE;
}
export function toErc20Units(value: bigint) {
  if (value < 0n) throw new Error("Negative amount");
  return { units: value / DECIMAL_SCALE, remainder: value % DECIMAL_SCALE };
}
export function formatUSDC(
  value: string | bigint,
  minimumDecimals = 2,
): string {
  const n = BigInt(value),
    sign = n < 0n ? "-" : "",
    abs = n < 0n ? -n : n;
  const scale = 10n ** BigInt(ARC.nativeDecimals);
  const fraction = (abs % scale)
    .toString()
    .padStart(ARC.nativeDecimals, "0")
    .replace(/0+$/, "")
    .padEnd(minimumDecimals, "0");
  return `${sign}${abs / scale}${fraction ? `.${fraction}` : ""}`;
}
export class ArcAccountingAdapter implements ChainAccountingAdapter {
  normalizeBalance(value: bigint) {
    if (value < 0n) throw new Error("Negative balance");
    return value;
  }
  calculateFee(input: unknown) {
    const receipt = z
      .object({
        gasUsed: z.bigint().nonnegative(),
        effectiveGasPrice: z.bigint().nonnegative(),
      })
      .parse(input);
    return receipt.gasUsed * receipt.effectiveGasPrice;
  }
  async parseMovements(input: unknown) {
    return this.explain(input).movements;
  }
  explain(input: unknown): ExplainedTransaction {
    const tx = inputSchema.parse(input);
    const evidence: Evidence[] = [],
      movements: Movement[] = [],
      warnings: string[] = [];
    const indices = new Set<number>();
    for (const log of [...tx.logs].sort((a, b) => a.logIndex - b.logIndex)) {
      if (log.removed)
        throw new Error("Removed log cannot enter a finalized ledger");
      if (indices.has(log.logIndex))
        throw new Error("Duplicate log index in receipt");
      indices.add(log.logIndex);
      if (log.address !== ARC.systemEmitter && log.address !== ARC.usdc)
        continue;
      if (log.topics[0] !== ARC.transferTopic) continue;
      if (
        log.topics.length !== 3 ||
        !/^0x[0-9a-fA-F]{64}$/.test(log.data) ||
        !log.topics.slice(1).every((t) => /^0x0{24}[0-9a-f]{40}$/.test(t))
      )
        throw new Error(`Malformed USDC Transfer at log ${log.logIndex}`);
      if (tx.status === "reverted")
        throw new Error("Reverted receipt contains transfer evidence");
      const source = log.address === ARC.systemEmitter ? "native" : "erc20";
      const raw = BigInt(log.data),
        from = `0x${log.topics[1].slice(-40)}` as Hex,
        to = `0x${log.topics[2].slice(-40)}` as Hex;
      evidence.push({
        logIndex: log.logIndex,
        source,
        from,
        to,
        rawAmount: raw.toString(),
        decimals: source === "native" ? 18 : 6,
        amount: (source === "native" ? raw : toNativeUnits(raw)).toString(),
        disposition: "unmatched",
      });
    }
    // The system stream is authoritative. Never manufacture a second movement
    // from an unmatched ERC-20 record; surface missing evidence for investigation.
    const available = new Map<string, Movement[]>();
    const key = (e: Evidence) => `${e.from}:${e.to}:${e.amount}`;
    for (const e of evidence.filter((e) => e.source === "native")) {
      if (e.amount === "0" || e.from === e.to) {
        e.disposition = "no-movement";
        continue;
      }
      const m: Movement = {
        id: `${tx.hash}:${e.logIndex}`,
        from: e.from,
        to: e.to,
        amount: e.amount,
        kind:
          e.from === ARC.zeroAddress
            ? "mint"
            : e.to === ARC.zeroAddress
              ? "burn"
              : "transfer",
        evidence: [e.logIndex],
      };
      e.disposition = "canonical";
      movements.push(m);
      available.set(key(e), [...(available.get(key(e)) ?? []), m]);
    }
    for (const e of evidence.filter((e) => e.source === "erc20")) {
      if (e.amount === "0" || e.from === e.to) {
        e.disposition = "no-movement";
        continue;
      }
      const m = available.get(key(e))?.shift();
      if (m) {
        m.evidence.push(e.logIndex);
        e.disposition = "matched";
      } else
        warnings.push(
          `ERC-20 log ${e.logIndex} has no matching native evidence; excluded from economic totals.`,
        );
    }
    return {
      hash: tx.hash,
      blockNumber: tx.blockNumber,
      blockHash: tx.blockHash,
      timestamp: tx.timestamp,
      sender: tx.sender,
      status: tx.status,
      finality: "finalized",
      fee: this.calculateFee(tx).toString(),
      movements,
      evidence,
      warnings,
    };
  }
}
