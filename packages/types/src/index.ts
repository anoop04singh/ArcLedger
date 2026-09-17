export type Hex = `0x${string}`;
export type Evidence = {
  logIndex: number;
  source: "native" | "erc20";
  from: Hex;
  to: Hex;
  rawAmount: string;
  decimals: 18 | 6;
  amount: string;
  disposition: "canonical" | "matched" | "unmatched" | "no-movement";
};
export type Movement = {
  id: string;
  from: Hex;
  to: Hex;
  amount: string;
  kind: "transfer" | "mint" | "burn";
  evidence: number[];
};
export type RawLog = {
  address: Hex;
  topics: Hex[];
  data: Hex;
  logIndex: number;
  removed?: boolean;
};
export type AccountingInput = {
  hash: Hex;
  blockNumber: string;
  blockHash: Hex;
  timestamp: string;
  sender: Hex;
  status: "success" | "reverted";
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  logs: RawLog[];
};
export type ExplainedTransaction = {
  hash: Hex;
  blockNumber: string;
  blockHash: Hex;
  timestamp: string;
  sender: Hex;
  status: "success" | "reverted";
  finality: "finalized";
  fee: string;
  movements: Movement[];
  evidence: Evidence[];
  warnings: string[];
};
export interface ChainAccountingAdapter {
  parseMovements(input: unknown): Promise<Movement[]>;
  calculateFee(input: unknown): bigint;
  normalizeBalance(value: bigint): bigint;
}
export type LedgerStatus = {
  mode: "demo" | "mainnet";
  state: "demo" | "live" | "syncing" | "idle" | "stale";
  chainId: number;
  latestIndexedBlock: string | null;
  latestFinalizedBlock: string | null;
  lag: string | null;
  startBlock: string | null;
  updatedAt: string | null;
  canonicalTransfers: number;
  duplicatesRemoved: number;
  accountingMismatches: number | null;
  normalizationWarnings: number;
  validation: "not-run";
};
export type AddressLedger = {
  address: Hex;
  mode: "demo" | "mainnet";
  balance: string | null;
  balanceBlock: string | null;
  received: string;
  sent: string;
  feesPaid: string;
  transactionCount: number;
  transactions: ExplainedTransaction[];
  nextOffset: number | null;
  coverageStart: string | null;
};
