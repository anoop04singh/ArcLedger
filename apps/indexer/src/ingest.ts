import type { createArcClient } from "@arcledger/arc-config";
import type { BlockRecord } from "@arcledger/database";
import { ArcAccountingAdapter } from "@arcledger/normalizer";
export async function readFinalizedBlock(
  client: ReturnType<typeof createArcClient>,
  number: bigint,
  finalizedHead: bigint,
): Promise<BlockRecord> {
  if (number < 0n || number > finalizedHead)
    throw new Error("Block outside finalized range");
  const block = await client.getBlock({
    blockNumber: number,
    includeTransactions: true,
  });
  const adapter = new ArcAccountingAdapter();
  const timestamp = new Date(Number(block.timestamp) * 1000).toISOString();
  const transactions = [];
  for (const tx of block.transactions) {
    const receipt = await client.getTransactionReceipt({ hash: tx.hash });
    if (receipt.blockHash !== block.hash || receipt.blockNumber !== number)
      throw new Error("Inconsistent receipt snapshot");
    transactions.push(
      adapter.explain({
        hash: tx.hash,
        blockNumber: number.toString(),
        blockHash: block.hash,
        timestamp,
        sender: tx.from,
        status: receipt.status,
        gasUsed: receipt.gasUsed,
        effectiveGasPrice: receipt.effectiveGasPrice,
        logs: receipt.logs,
      }),
    );
  }
  return {
    number: number.toString(),
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp,
    transactions,
  };
}
