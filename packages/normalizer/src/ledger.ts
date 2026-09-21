import type {
  AccountingInput,
  AddressEntry,
  ExplainedTransaction,
  RpcReceipt,
  RawLog,
} from "@arcledger/types";
import { ArcAccountingAdapter, formatUSDC } from "./index.js";

/** Reusable, side-effect-free normalization of receipt/log evidence. Amounts are raw native units. */
export function normalizeArcTransaction(input: {
  receipt: RpcReceipt;
  logs?: RawLog[];
  timestamp: string;
}) {
  const r = input.receipt;
  if (r.status !== "0x0" && r.status !== "0x1")
    throw new Error("Invalid receipt status");
  const explanation = new ArcAccountingAdapter().explain({
    hash: r.transactionHash,
    blockNumber: BigInt(r.blockNumber).toString(),
    blockHash: r.blockHash,
    timestamp: input.timestamp,
    sender: r.from,
    status: r.status === "0x1" ? "success" : "reverted",
    gasUsed: BigInt(r.gasUsed),
    effectiveGasPrice: BigInt(r.effectiveGasPrice),
    logs:
      input.logs ??
      r.logs.map((log) => ({ ...log, logIndex: Number(BigInt(log.logIndex)) })),
  } satisfies AccountingInput);
  return {
    ...explanation,
    duplicates: explanation.evidence.filter((e) => e.disposition === "matched"),
  };
}

/** Each address's sum(netChange) equals canonical inflows - outflows - its sender fee. */
export function constructAddressEntries(
  tx: ExplainedTransaction,
  transactionIndex = 0,
): AddressEntry[] {
  const entries: AddressEntry[] = [];
  let feeAssigned = false;
  const append = (
    address: AddressEntry["address"],
    counterparty: AddressEntry["counterparty"],
    amount: bigint,
    incoming: boolean,
    type: AddressEntry["type"],
    fee: bigint,
  ) => {
    const gross =
      type === "network_fee" || type === "self"
        ? 0n
        : incoming
          ? amount
          : -amount;
    const entryIndex = entries.length;
    entries.push({
      id: `${tx.hash}:ledger:${entryIndex}`,
      address,
      counterparty,
      direction: type === "self" ? "self" : incoming ? "incoming" : "outgoing",
      amount: amount.toString(),
      fee: fee.toString(),
      grossChange: gross.toString(),
      netChange: (gross - fee).toString(),
      type,
      txHash: tx.hash,
      blockNumber: tx.blockNumber,
      transactionIndex,
      entryIndex,
      timestamp: tx.timestamp,
      final: true,
      status: tx.status,
    });
  };
  for (const m of tx.movements) {
    if (BigInt(m.amount) === 0n) continue;
    const fee = !feeAssigned && m.from === tx.sender ? BigInt(tx.fee) : 0n;
    if (m.from === tx.sender) feeAssigned = true;
    if (m.from === m.to) {
      append(m.from, m.to, BigInt(m.amount), false, "self", fee);
      continue;
    }
    // Mint/burn sentinel addresses are not accounts with economic ledger balances.
    if (m.kind !== "mint")
      append(m.from, m.to, BigInt(m.amount), false, m.kind, fee);
    if (m.kind !== "burn")
      append(m.to, m.from, BigInt(m.amount), true, m.kind, 0n);
  }
  if (!feeAssigned)
    append(tx.sender, null, 0n, false, "network_fee", BigInt(tx.fee));
  return entries;
}
export function publicEntry(entry: AddressEntry): AddressEntry {
  return {
    ...entry,
    amount: formatUSDC(entry.amount, 6),
    fee: entry.fee === "0" ? "0" : formatUSDC(entry.fee, 6),
    grossChange: formatUSDC(entry.grossChange, 6),
    netChange: formatUSDC(entry.netChange, 6),
  };
}
