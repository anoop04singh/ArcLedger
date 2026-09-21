import { z } from "zod";
import { ARC_MAINNET, type ArcRpc } from "@arcledger/arc-config";
import type {
  RawBlockRecord,
  RpcLog,
  RpcTransaction,
  RpcReceipt,
  Hex,
} from "@arcledger/types";
const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const quantity = z.string().regex(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/);
const bytes = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/);
const logSchema = z
  .object({
    address,
    topics: z.array(hash),
    data: bytes,
    blockNumber: quantity,
    blockHash: hash,
    transactionHash: hash,
    transactionIndex: quantity,
    logIndex: quantity,
    removed: z.boolean().optional(),
  })
  .passthrough();
const txSchema = z
  .object({
    hash,
    blockHash: hash,
    blockNumber: quantity,
    transactionIndex: quantity,
    from: address,
    to: address.nullable(),
    value: quantity,
  })
  .passthrough();
const receiptSchema = z
  .object({
    transactionHash: hash,
    transactionIndex: quantity,
    blockHash: hash,
    blockNumber: quantity,
    from: address,
    to: address.nullable(),
    status: z.enum(["0x0", "0x1"]),
    gasUsed: quantity,
    effectiveGasPrice: quantity,
    logs: z.array(logSchema),
  })
  .passthrough();
const blockSchema = z
  .object({
    number: quantity,
    hash,
    parentHash: hash,
    timestamp: quantity,
    transactions: z.array(hash),
  })
  .passthrough();
export class RpcSnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpcSnapshotError";
  }
}
function consistent(condition: boolean, message: string): asserts condition {
  if (!condition) throw new RpcSnapshotError(message);
}
export async function mapConcurrent<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(items.length);
  let cursor = 0;
  const results = await Promise.allSettled(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        output[index] = await fn(items[index], index);
      }
    }),
  );
  const failed = results.find((r) => r.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  return output;
}
/** Only structural validation here. No USDC emitter filtering or event decoding. */
export async function readRawBlock(
  rpc: ArcRpc,
  number: bigint,
  concurrency = 16,
): Promise<RawBlockRecord> {
  const blockTag = `0x${number.toString(16)}`;
  const [blockValue, logsValue] = await Promise.all([
    rpc.request({ method: "eth_getBlockByNumber", params: [blockTag, false] }),
    rpc.request({
      method: "eth_getLogs",
      params: [{ fromBlock: blockTag, toBlock: blockTag }],
    }),
  ]);
  const raw = blockSchema.parse(blockValue);
  consistent(BigInt(raw.number) === number, "Wrong block number");
  consistent(
    new Set(raw.transactions.map((h) => h.toLowerCase())).size ===
      raw.transactions.length,
    "Duplicate transaction hash",
  );
  const logs = z.array(logSchema).parse(logsValue) as RpcLog[];
  const transactions = await mapConcurrent(
    raw.transactions,
    concurrency,
    async (txHash, index) => {
      const [t, r] = await Promise.all([
        rpc.request({ method: "eth_getTransactionByHash", params: [txHash] }),
        rpc.request({ method: "eth_getTransactionReceipt", params: [txHash] }),
      ]);
      const transaction = txSchema.parse(t) as RpcTransaction,
        receipt = receiptSchema.parse(r) as RpcReceipt;
      consistent(
        transaction.hash.toLowerCase() === txHash.toLowerCase() &&
          receipt.transactionHash.toLowerCase() === txHash.toLowerCase(),
        "Transaction hash mismatch",
      );
      consistent(
        [transaction, receipt].every(
          (x) =>
            x.blockHash.toLowerCase() === raw.hash.toLowerCase() &&
            BigInt(x.blockNumber) === number &&
            BigInt(x.transactionIndex) === BigInt(index),
        ),
        "Inconsistent receipt snapshot",
      );
      consistent(
        transaction.from.toLowerCase() === receipt.from.toLowerCase() &&
          transaction.to?.toLowerCase() === receipt.to?.toLowerCase(),
        "Receipt participants mismatch",
      );
      consistent(
        receipt.logs.every(
          (log) =>
            log.transactionHash.toLowerCase() ===
              receipt.transactionHash.toLowerCase() &&
            BigInt(log.transactionIndex) === BigInt(receipt.transactionIndex),
        ),
        "Log belongs to another receipt",
      );
      return { transaction, receipt };
    },
  );
  const eventKey = (log: RpcLog) =>
    JSON.stringify([
      log.blockHash.toLowerCase(),
      BigInt(log.blockNumber).toString(),
      log.transactionHash.toLowerCase(),
      BigInt(log.transactionIndex).toString(),
      BigInt(log.logIndex).toString(),
      log.address.toLowerCase(),
      log.topics.map((t) => t.toLowerCase()),
      log.data.toLowerCase(),
    ]);
  const receiptLogs = transactions.flatMap((t) => t.receipt.logs);
  const validateLogs = (items: RpcLog[]) => {
    const indices = new Set<string>();
    for (const log of items) {
      const i = Number(BigInt(log.transactionIndex));
      consistent(
        !log.removed &&
          log.blockHash.toLowerCase() === raw.hash.toLowerCase() &&
          BigInt(log.blockNumber) === number,
        "Inconsistent log snapshot",
      );
      consistent(
        Number.isSafeInteger(i) &&
          raw.transactions[i]?.toLowerCase() ===
            log.transactionHash.toLowerCase(),
        "Log transaction mismatch",
      );
      const key = BigInt(log.logIndex).toString();
      consistent(!indices.has(key), "Duplicate log index");
      indices.add(key);
    }
  };
  validateLogs(logs);
  validateLogs(receiptLogs);
  const expected = new Set(receiptLogs.map(eventKey));
  consistent(
    expected.size === logs.length &&
      logs.every((log) => expected.has(eventKey(log))),
    "eth_getLogs and receipts disagree",
  );
  return {
    chainId: ARC_MAINNET.chainId,
    number: number.toString(),
    hash: raw.hash as Hex,
    parentHash: raw.parentHash as Hex,
    timestamp: new Date(Number(BigInt(raw.timestamp)) * 1000).toISOString(),
    raw,
    transactions,
    logs,
  };
}
