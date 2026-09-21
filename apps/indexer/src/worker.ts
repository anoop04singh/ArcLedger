import { setTimeout as delay } from "node:timers/promises";
import {
  ARC_MAINNET,
  ChainMismatchError,
  type ArcRpc,
} from "@arcledger/arc-config";
import {
  checkpoint,
  heartbeat,
  commitRawBlock,
  DataIntegrityError,
  type SqlClient,
} from "@arcledger/database";
import { readRawBlock, mapConcurrent } from "./ingest.js";
export type IndexerOptions = {
  startBlock?: bigint;
  pollMs: number;
  retryMs: number;
  blockPrefetch: number;
  transactionConcurrency: number;
};
export function readIndexerOptions(
  env: NodeJS.ProcessEnv = process.env,
): IndexerOptions {
  const start = env.INDEX_START_BLOCK || env.INDEXER_START_BLOCK;
  if (start !== undefined && !/^\d+$/.test(start))
    throw new Error("INDEX_START_BLOCK must be a non-negative integer");
  const integer = (
    name: string,
    value: string | undefined,
    defaultValue: number,
    min: number,
    max: number,
  ) => {
    const parsed = value === undefined ? defaultValue : Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max)
      throw new Error(`${name} must be ${min}–${max}`);
    return parsed;
  };
  return {
    startBlock: start === undefined ? undefined : BigInt(start),
    pollMs: integer("INDEXER_POLL_MS", env.INDEXER_POLL_MS, 250, 100, 60000),
    retryMs: integer(
      "INDEXER_RETRY_MS",
      env.INDEXER_RETRY_MS,
      1000,
      100,
      60000,
    ),
    blockPrefetch: integer(
      "INDEXER_BLOCK_PREFETCH",
      env.INDEXER_BLOCK_PREFETCH,
      4,
      1,
      16,
    ),
    transactionConcurrency: integer(
      "INDEXER_TX_CONCURRENCY",
      env.INDEXER_TX_CONCURRENCY,
      32,
      1,
      64,
    ),
  };
}
export type IndexerProgress = {
  block: string;
  head: string;
  lag: string;
  transactions: number;
  logs: number;
  elapsedMs: number;
};
export type IndexerSession = { db: SqlClient; close: () => Promise<void> };
export async function runIndexer({
  rpc,
  connect,
  options,
  signal,
  onProgress = () => {},
  onRetry = () => {},
}: {
  rpc: ArcRpc;
  connect: () => Promise<IndexerSession>;
  options: IndexerOptions;
  signal: AbortSignal;
  onProgress?: (progress: IndexerProgress) => void | Promise<void>;
  onRetry?: (error: unknown) => void;
}) {
  const sleep = async (ms: number) => {
    try {
      await delay(ms, undefined, { signal });
    } catch {
      if (!signal.aborted) throw new Error("Sleep failed");
    }
  };
  let firstBlock = options.startBlock;
  let consecutiveFailures = 0;
  while (!signal.aborted) {
    let session: IndexerSession | undefined;
    try {
      session = await connect();
      const {
        rows: [lock],
      } = await session.db.query(
        "SELECT pg_try_advisory_lock($1,1) AS acquired",
        [ARC_MAINNET.chainId],
      );
      if (!lock.acquired)
        throw new Error("Indexer writer lock is held; retrying");
      const state = await checkpoint(session.db);
      if (firstBlock === undefined)
        firstBlock = state
          ? BigInt(state.last_processed_block) + 1n
          : await rpc.blockNumber();
      let next = state ? BigInt(state.last_processed_block) + 1n : firstBlock;
      while (!signal.aborted) {
        const head = await rpc.blockNumber();
        await heartbeat(session.db, head);
        if (next > head) {
          await sleep(options.pollMs);
          continue;
        }
        const numbers: bigint[] = [];
        for (
          let n = next;
          n <= head && numbers.length < options.blockPrefetch;
          n++
        )
          numbers.push(n);
        const started = performance.now();
        const blocks = await mapConcurrent(
          numbers,
          options.blockPrefetch,
          (n) => readRawBlock(rpc, n, options.transactionConcurrency),
        );
        for (const block of blocks) {
          if (signal.aborted) break;
          await commitRawBlock(session.db, block, head.toString());
          consecutiveFailures = 0;
          next = BigInt(block.number) + 1n;
          await onProgress({
            block: block.number,
            head: head.toString(),
            lag: (head - BigInt(block.number)).toString(),
            transactions: block.transactions.length,
            logs: block.logs.length,
            elapsedMs: Math.round(performance.now() - started),
          });
        }
      }
    } catch (error) {
      if (
        error instanceof DataIntegrityError ||
        error instanceof ChainMismatchError
      )
        throw error;
      consecutiveFailures++;
      if (!signal.aborted) onRetry(error);
    } finally {
      if (session) await session.close().catch(() => {});
    }
    if (!signal.aborted)
      await sleep(
        Math.min(
          10000,
          options.retryMs * 2 ** Math.min(consecutiveFailures - 1, 4),
        ),
      );
  }
}
