import { ARC_MAINNET, ArcRpc, type RpcRequest } from "@arcledger/arc-config";
import type {
  Hex,
  RawBlockRecord,
  RpcLog,
  RpcReceipt,
  RpcTransaction,
} from "@arcledger/types";
export const hash = (n: number | bigint) =>
  `0x${BigInt(n).toString(16).padStart(64, "0")}` as Hex;
export const qty = (n: number | bigint) => `0x${BigInt(n).toString(16)}` as Hex;
export const A = `0x${"11".repeat(20)}` as Hex,
  B = `0x${"22".repeat(20)}` as Hex;
export function fixture(number = 100): RawBlockRecord {
  const blockHash = hash(number),
    txHash = hash(number * 100);
  const log = (emitter: Hex, amount: bigint, index: number): RpcLog => ({
    address: emitter,
    topics: [ARC_MAINNET.transferTopic, hash(BigInt(A)), hash(BigInt(B))],
    data: hash(amount),
    blockNumber: qty(number),
    blockHash,
    transactionHash: txHash,
    transactionIndex: "0x0",
    logIndex: qty(index),
    removed: false,
    providerExtra: "retain me",
  });
  const logs = [
    log(ARC_MAINNET.systemEmitter, 10n ** 19n, 0),
    log(ARC_MAINNET.usdc, 10n ** 7n, 1),
    { ...log(A, 0n, 2), topics: [], data: "0x1234" as Hex },
  ];
  const transactions = [0, 1].map((index) => {
    const t: RpcTransaction = {
      hash: hash(number * 100 + index),
      blockHash,
      blockNumber: qty(number),
      transactionIndex: qty(index),
      from: index === 0 ? A : B,
      to: index === 0 ? B : null,
      value: "0x0",
      input: "0xdeadbeef",
      type: "0x2",
      nonce: qty(number),
      customTransactionField: { test: true },
    };
    const r: RpcReceipt = {
      transactionHash: t.hash,
      transactionIndex: t.transactionIndex,
      blockHash,
      blockNumber: qty(number),
      from: t.from,
      to: t.to,
      status: index === 0 ? "0x1" : "0x0",
      gasUsed: "0x5208",
      effectiveGasPrice: qty(20000000000n),
      logs: index === 0 ? logs : [],
      contractAddress: null,
      customReceiptField: "retained",
    };
    return { transaction: t, receipt: r };
  });
  return {
    chainId: ARC_MAINNET.chainId,
    number: String(number),
    hash: blockHash,
    parentHash: hash(number - 1),
    timestamp: "2026-09-17T10:00:00.000Z",
    raw: {
      number: qty(number),
      hash: blockHash,
      parentHash: hash(number - 1),
      timestamp: qty(1789639200),
      transactions: transactions.map((t) => t.transaction.hash),
      extraHeader: "retained",
    },
    transactions,
    logs,
  };
}
export function mockRpc(
  blocks: RawBlockRecord[],
  intercept?: (request: RpcRequest) => unknown,
) {
  return new ArcRpc(async (request) => {
    const intercepted = intercept?.(request);
    if (intercepted !== undefined) return intercepted;
    if (request.method === "eth_chainId") return qty(ARC_MAINNET.chainId);
    if (request.method === "eth_blockNumber")
      return qty(Math.max(...blocks.map((b) => Number(b.number))));
    if (request.method === "eth_getBalance") return qty(123n);
    if (request.method === "eth_getBlockByNumber")
      return blocks.find(
        (b) => BigInt(b.number) === BigInt(request.params![0] as string),
      )?.raw;
    if (request.method === "eth_getLogs")
      return blocks.find(
        (b) =>
          BigInt(b.number) ===
          BigInt((request.params![0] as { fromBlock: string }).fromBlock),
      )?.logs;
    const t = blocks
      .flatMap((b) => b.transactions)
      .find((t) => t.transaction.hash === request.params?.[0]);
    if (request.method === "eth_getTransactionByHash") return t?.transaction;
    if (request.method === "eth_getTransactionReceipt") return t?.receipt;
    throw new Error("Unexpected RPC");
  });
}
