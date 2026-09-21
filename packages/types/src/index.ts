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
  kind: "transfer" | "mint" | "burn" | "self";
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
  retention?: {
    capBytes: number;
    databaseBytes: number;
    prunedBlocks: number;
    prunedThrough: string | null;
    state: "ready" | "pruning" | "blocked";
    checkedAt: string;
  };
  mode: "demo" | "mainnet";
  pendingNormalization?: number;
  state: "demo" | "live" | "syncing" | "idle" | "stale";
  chainId: number;
  rawEvents?: number;
  rawTransactions?: number;
  rawCoverageStart?: string | null;
  latestIndexedBlock: string | null;
  latestFinalizedBlock: string | null;
  lag: string | null;
  startBlock: string | null;
  updatedAt: string | null;
  canonicalTransfers: number;
  duplicatesRemoved: number;
  accountingMismatches: number | null;
  normalizationWarnings: number;
  validation: "not-run" | "valid" | "invalid" | "error";
  validationRun?: ValidationRun | null;
};
export type AddressLedger = {
  address: Hex;
  mode: "demo" | "mainnet";
  pendingNormalization?: number;
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

/** Raw JSON-RPC values stay hex strings; unknown provider fields are preserved. */
export type RpcObject = Record<string, unknown>;
export type RpcLog = RpcObject & {
  address: Hex;
  topics: Hex[];
  data: Hex;
  blockNumber: Hex;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: Hex;
  logIndex: Hex;
  removed?: boolean;
};
export type RpcTransaction = RpcObject & {
  hash: Hex;
  blockHash: Hex;
  blockNumber: Hex;
  transactionIndex: Hex;
  from: Hex;
  to: Hex | null;
  value: Hex;
};
export type RpcReceipt = RpcObject & {
  transactionHash: Hex;
  transactionIndex: Hex;
  blockHash: Hex;
  blockNumber: Hex;
  from: Hex;
  to: Hex | null;
  status: Hex;
  gasUsed: Hex;
  effectiveGasPrice: Hex;
  logs: RpcLog[];
};
export type RawTransactionRecord = {
  transaction: RpcTransaction;
  receipt: RpcReceipt;
};
export type RawBlockRecord = {
  chainId: number;
  number: string;
  hash: Hex;
  parentHash: Hex;
  timestamp: string;
  raw: RpcObject;
  transactions: RawTransactionRecord[];
  logs: RpcLog[];
};
export type AddressEntry = {
  id: string;
  address: Hex;
  direction: "incoming" | "outgoing" | "self";
  counterparty: Hex | null;
  amount: string;
  fee: string;
  grossChange: string;
  netChange: string;
  type: "transfer" | "mint" | "burn" | "self" | "network_fee";
  txHash: Hex;
  blockNumber: string;
  transactionIndex: number;
  entryIndex: number;
  timestamp: string;
  final: true;
  status: "success" | "reverted";
};
export type LedgerPosition = {
  block: string;
  transactionIndex: number;
  hash: string;
  entryIndex: number;
};
export type LedgerPage = {
  entries: AddressEntry[];
  snapshot: string;
  hasMore: boolean;
};
export type AddressSummary = {
  address: Hex;
  mode: "demo" | "mainnet";
  network: "arc-mainnet";
  currency: "USDC";
  balance: string | null;
  balanceBlock: string | null;
  received: string;
  sent: string;
  feesPaid: string;
  transactions: number;
  coverageStart: string | null;
  pendingNormalization: number;
};
export type PublicLedger = {
  address: Hex;
  network: "arc-mainnet";
  currency: "USDC";
  mode: "demo" | "mainnet";
  entries: (Omit<AddressEntry, "blockNumber"> & {
    blockNumber: number | string;
  })[];
  nextCursor: string | null;
};
export type PublicStatus = Omit<LedgerStatus, "latestIndexedBlock" | "lag"> & {
  recentTransactions?: {
    hash: Hex;
    blockNumber: string;
    timestamp: string;
    from: Hex;
    to: Hex | null;
    amount: string;
    fee: string;
    movements: number;
    status: "success" | "reverted";
    duplicates: number;
  }[];
  network: "arc-mainnet";
  status: "healthy" | "degraded" | "demo";
  database: "healthy" | "not-configured";
  rpc: "healthy" | "unavailable" | "not-configured";
  latestChainBlock: number | string | null;
  latestIndexedBlock: number | string | null;
  lag: number | string | null;
};

export type ValidationRun = {
  id: string;
  startedAt: string;
  completedAt: string;
  startBlock: string;
  endBlock: string;
  blocksScanned: number;
  transactions: number;
  rawRecords: number;
  duplicateRecords: number;
  canonicalMovements: number;
  feeMismatches: number;
  accountingMismatches: number;
  status: "valid" | "invalid" | "error";
  scope: string;
  issues: string[];
};
