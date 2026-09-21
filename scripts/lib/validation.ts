import { decodeEventLog, parseAbi, parseUnits } from "viem";
import { ARC_MAINNET as ARC } from "@arcledger/arc-config";
import { formatUSDC } from "@arcledger/normalizer";
import type { RawBlockRecord, RpcLog } from "@arcledger/types";
import type { SqlClient } from "@arcledger/database";

export type ValidationSnapshot = {
  blocks: any[];
  transactions: any[];
  events: any[];
  transfers: any[];
  entries: any[];
};
/** Caller supplies a dedicated connection in a repeatable-read transaction. */
export async function readValidationSnapshot(
  db: SqlClient,
  start: string,
  end: string,
): Promise<ValidationSnapshot> {
  const values = [ARC.chainId, start, end];
  const read = async (sql: string) => (await db.query(sql, values)).rows;
  return {
    blocks: await read(
      "SELECT * FROM blocks WHERE chain_id=$1 AND block_number BETWEEN $2 AND $3 ORDER BY block_number",
    ),
    transactions: await read(
      "SELECT * FROM transactions WHERE chain_id=$1 AND block_number BETWEEN $2 AND $3 ORDER BY block_number,transaction_index",
    ),
    events: await read(
      "SELECT * FROM raw_events WHERE chain_id=$1 AND block_number BETWEEN $2 AND $3 ORDER BY block_number,log_index",
    ),
    transfers: await read(
      "SELECT m.* FROM transfers m JOIN transactions t ON t.chain_id=m.chain_id AND t.tx_hash=m.transaction_hash WHERE t.chain_id=$1 AND t.block_number BETWEEN $2 AND $3",
    ),
    entries: await read(
      "SELECT * FROM address_entries WHERE chain_id=$1 AND block_number BETWEEN $2 AND $3 ORDER BY block_number,transaction_index,entry_index",
    ),
  };
}
const abi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const logIdentity = (l: RpcLog) =>
  JSON.stringify([
    l.address.toLowerCase(),
    l.topics.map((t) => t.toLowerCase()),
    l.data.toLowerCase(),
    BigInt(l.logIndex).toString(),
    l.transactionHash.toLowerCase(),
    l.blockHash.toLowerCase(),
  ]);
/** Independent ABI decoding and accounting oracle; never calls the normalization engine. */
export function validateSnapshot(
  raw: RawBlockRecord[],
  db: ValidationSnapshot,
  start: string,
  end: string,
) {
  const issues: string[] = [];
  let accountingMismatches = 0,
    feeMismatches = 0,
    canonicalMovements = 0,
    duplicateRecords = 0,
    rawRecords = 0;
  const check = (ok: boolean, message: string, fee = false) => {
    if (!ok) {
      if (fee) feeMismatches++;
      else accountingMismatches++;
      if (issues.length < 100) issues.push(message);
    }
  };
  const same = (a: unknown, b: unknown) =>
    JSON.stringify(a) === JSON.stringify(b);
  check(
    raw.length > 0 && raw.length === Number(BigInt(end) - BigInt(start) + 1n),
    "Incomplete RPC block range",
  );
  check(
    db.blocks.length === raw.length,
    "Stored block coverage differs from RPC",
  );
  check(
    db.transactions.length ===
      raw.reduce((n, b) => n + b.transactions.length, 0),
    "Transaction coverage differs from RPC",
  );
  check(db.transactions.length > 0, "Sample has no transactions");
  check(
    db.events.length === raw.reduce((n, b) => n + b.logs.length, 0),
    "Raw log coverage differs from RPC",
  );
  for (const [bi, block] of raw.entries()) {
    check(
      BigInt(block.number) === BigInt(start) + BigInt(bi),
      "Noncontiguous RPC range",
    );
    const storedBlock = db.blocks.find(
      (b) => String(b.block_number) === block.number,
    );
    check(
      storedBlock?.block_hash === block.hash,
      `Block ${block.number}: hash mismatch`,
    );
    if (bi)
      check(
        block.parentHash === raw[bi - 1].hash,
        `Block ${block.number}: parent mismatch`,
      );
    for (const { transaction: t, receipt: r } of block.transactions) {
      const tag = t.hash;
      const row = db.transactions.find((x) => x.tx_hash === tag);
      if (!row) {
        check(false, `${tag}: missing transaction`);
        continue;
      }
      const e = row.explanation;
      check(row.ledger_version === 1 && !!e, `${tag}: normalization pending`);
      check(
        String(row.block_number) === block.number &&
          row.from_address === t.from &&
          row.to_address === t.to &&
          row.transaction_index === Number(BigInt(t.transactionIndex)),
        `${tag}: transaction metadata mismatch`,
      );
      check(
        row.status === (r.status === "0x1" ? "success" : "reverted"),
        `${tag}: receipt status mismatch`,
      );
      const fee = BigInt(r.gasUsed) * BigInt(r.effectiveGasPrice);
      check(
        BigInt(row.fee_raw) === fee &&
          BigInt(row.gas_used) === BigInt(r.gasUsed) &&
          BigInt(row.effective_gas_price) === BigInt(r.effectiveGasPrice),
        `${tag}: receipt/database fee mismatch`,
        true,
      );
      check(
        !!e &&
          BigInt(e.fee) === fee &&
          parseUnits(formatUSDC(e.fee, 6), 18) === fee,
        `${tag}: explained/formatted fee mismatch`,
        true,
      );
      const savedLogs = db.events
        .filter((x) => x.transaction_hash === tag)
        .map((x) => logIdentity(x.raw_log))
        .sort();
      const rpcLogs = r.logs.map(logIdentity).sort();
      check(same(savedLogs, rpcLogs), `${tag}: raw logs differ from RPC`);
      check(
        !!row.raw_receipt &&
          same(row.raw_receipt.logs.map(logIdentity).sort(), rpcLogs),
        `${tag}: retained receipt logs differ`,
      );
      check(
        row.raw_receipt?.gasUsed === r.gasUsed &&
          row.raw_receipt?.effectiveGasPrice === r.effectiveGasPrice &&
          row.raw_receipt?.transactionHash === tag,
        `${tag}: retained receipt mismatch`,
      );
      const decoded = r.logs
        .filter(
          (l) =>
            [ARC.systemEmitter, ARC.usdc].includes(
              l.address.toLowerCase() as typeof ARC.usdc,
            ) && l.topics[0]?.toLowerCase() === ARC.transferTopic,
        )
        .map((l) => {
          const { args } = decodeEventLog({
            abi,
            data: l.data,
            topics: l.topics as [
              typeof ARC.transferTopic,
              ...(typeof ARC.transferTopic)[],
            ],
            strict: true,
          });
          return {
            index: Number(BigInt(l.logIndex)),
            from: args.from.toLowerCase(),
            to: args.to.toLowerCase(),
            amount: args.value,
            native: l.address.toLowerCase() === ARC.systemEmitter,
          };
        })
        .sort((a, b) => a.index - b.index);
      rawRecords += decoded.length;
      check(
        e?.hash === tag &&
          e?.blockHash === block.hash &&
          e?.blockNumber === block.number &&
          e?.sender === t.from &&
          e?.status === row.status,
        `${tag}: explanation metadata mismatch`,
      );
      check(
        e?.evidence.length === decoded.length,
        `${tag}: evidence coverage mismatch`,
      );
      check(
        r.status === "0x1" || decoded.length === 0,
        `${tag}: reverted transaction contains transfer logs`,
      );
      const natives = decoded.filter((d) => d.native && d.amount > 0n);
      const used = new Set<number>();
      const expectedEvidence = new Map(
        natives.map((n) => [n.index, [n.index]]),
      );
      for (const erc of decoded.filter((d) => !d.native && d.amount > 0n)) {
        const match = natives.find(
          (n) =>
            !used.has(n.index) &&
            n.from === erc.from &&
            n.to === erc.to &&
            n.amount === erc.amount * 1000000000000n,
        );
        check(
          !!match || erc.from === erc.to,
          `${tag}: ERC-20 log ${erc.index} has no exact native match`,
        );
        if (match) {
          used.add(match.index);
          expectedEvidence.get(match.index)!.push(erc.index);
          duplicateRecords++;
        }
      }
      const selfRecords = decoded.filter(
        (d) =>
          !d.native &&
          d.from === d.to &&
          d.amount > 0n &&
          ![...expectedEvidence.values()].some(
            (indices) => indices[1] === d.index,
          ),
      );
      const canonical = [
        ...natives,
        ...selfRecords.map((d) => ({
          ...d,
          amount: d.amount * 1000000000000n,
        })),
      ].sort((a, b) => a.index - b.index);
      for (const d of selfRecords) expectedEvidence.set(d.index, [d.index]);
      canonicalMovements += canonical.length;
      for (const d of decoded) {
        const evidence = e?.evidence.find((x: any) => x.logIndex === d.index);
        const matched = [...expectedEvidence.values()].some(
          (indices) => indices[1] === d.index,
        );
        const disposition =
          d.amount === 0n
            ? "no-movement"
            : d.native
              ? "canonical"
              : d.from === d.to && !matched
                ? "canonical"
                : matched
                  ? "matched"
                  : "unmatched";
        check(
          evidence?.from === d.from &&
            evidence?.to === d.to &&
            evidence?.rawAmount === String(d.amount) &&
            evidence?.amount ===
              String(d.native ? d.amount : d.amount * 1000000000000n) &&
            evidence?.decimals === (d.native ? 18 : 6) &&
            evidence?.source === (d.native ? "native" : "erc20") &&
            evidence?.disposition === disposition,
          `${tag}: raw-to-explain evidence mismatch at ${d.index}`,
        );
      }
      const stored = db.transfers.filter((m) => m.transaction_hash === tag);
      check(
        stored.length === canonical.length &&
          e?.movements.length === canonical.length,
        `${tag}: canonical count mismatch`,
      );
      check(
        stored.length <= decoded.length,
        `${tag}: canonical count exceeds raw records`,
      );
      check(
        e?.evidence.filter((x: any) => x.disposition === "matched").length ===
          used.size,
        `${tag}: duplicate evidence count mismatch`,
      );
      const expectedEntries: {
        address: string;
        counterparty: string | null;
        amount: string;
        gross: string;
        type: string;
      }[] = [];
      for (const n of canonical) {
        const id = `${tag}:${n.index}`,
          m = stored.find((m) => m.id === id),
          explained = e?.movements.find((m: any) => m.id === id);
        const kind =
          n.from === n.to
            ? "self"
            : n.from === ARC.zeroAddress
              ? "mint"
              : n.to === ARC.zeroAddress
                ? "burn"
                : "transfer";
        check(
          m?.from_address === n.from &&
            m?.to_address === n.to &&
            m?.amount === String(n.amount),
          `${tag}: canonical participants/amount mismatch at ${n.index}`,
        );
        check(
          explained?.from === n.from &&
            explained?.to === n.to &&
            explained?.amount === String(n.amount) &&
            explained?.kind === kind &&
            same(explained?.evidence, expectedEvidence.get(n.index)),
          `${tag}: explain evidence mismatch at ${n.index}`,
        );
        if (n.from === n.to)
          expectedEntries.push({
            address: n.from,
            counterparty: n.to,
            amount: String(n.amount),
            gross: "0",
            type: "self",
          });
        else {
          if (n.from !== ARC.zeroAddress)
            expectedEntries.push({
              address: n.from,
              counterparty: n.to,
              amount: String(n.amount),
              gross: String(-n.amount),
              type: kind,
            });
          if (n.to !== ARC.zeroAddress)
            expectedEntries.push({
              address: n.to,
              counterparty: n.from,
              amount: String(n.amount),
              gross: String(n.amount),
              type: kind,
            });
        }
      }
      const entries = db.entries.filter((x) => x.transaction_hash === tag);
      if (!canonical.some((n) => n.from === t.from))
        expectedEntries.push({
          address: t.from,
          counterparty: null,
          amount: "0",
          gross: "0",
          type: "network_fee",
        });
      const shape = (x: (typeof expectedEntries)[number]) => JSON.stringify(x);
      check(
        same(
          entries
            .map((x) =>
              shape({
                address: x.address,
                counterparty: x.counterparty,
                amount: x.amount_raw,
                gross: x.gross_change,
                type: x.entry_type,
              }),
            )
            .sort(),
          expectedEntries.map(shape).sort(),
        ),
        `${tag}: address ledger differs from independent movements`,
      );
      check(
        entries.reduce((n, x) => n + BigInt(x.fee_raw), 0n) === fee &&
          entries.every(
            (x) =>
              BigInt(x.fee_raw) >= 0n &&
              (x.address === t.from || BigInt(x.fee_raw) === 0n),
          ) &&
          entries.filter((x) => BigInt(x.fee_raw) > 0n).length < 2,
        `${tag}: ledger fee ownership/count mismatch`,
        true,
      );
      check(
        entries.every(
          (x) =>
            BigInt(x.net_change) === BigInt(x.gross_change) - BigInt(x.fee_raw),
        ),
        `${tag}: net change mismatch`,
      );
      check(
        !e?.warnings.length,
        `${tag}: normalization warnings require investigation`,
      );
    }
  }
  return {
    blocksScanned: raw.length,
    transactions: db.transactions.length,
    rawRecords,
    canonicalMovements,
    duplicateRecords,
    feeMismatches,
    accountingMismatches,
    status:
      accountingMismatches + feeMismatches === 0
        ? ("valid" as const)
        : ("invalid" as const),
    issues,
  };
}
