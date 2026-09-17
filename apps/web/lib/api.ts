import type {
  AddressLedger,
  ExplainedTransaction,
  LedgerStatus,
} from "@arcledger/types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function request<T>(path: string): Promise<T> {
  const base = process.env.API_URL ?? "http://127.0.0.1:3001";
  let response: Response;
  try {
    response = await fetch(`${base}/v1${path}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ApiError(
      503,
      "The ledger service is unavailable. Start the local API and try again.",
    );
  }
  if (!response.ok) {
    const body = await response.json();
    throw new ApiError(response.status, body.error ?? "Unable to load ledger");
  }
  return response.json();
}
export const getStatus = () => request<LedgerStatus>("/status");
export const getAddress = (address: string, offset = 0) =>
  request<AddressLedger>(
    `/addresses/${encodeURIComponent(address)}?offset=${offset}`,
  );
export const getTransaction = (hash: string) =>
  request<ExplainedTransaction & { mode: "demo" | "mainnet" }>(
    `/transactions/${encodeURIComponent(hash)}`,
  );
export const short = (value: string) =>
  `${value.slice(0, 6)}…${value.slice(-4)}`;
export const DEMO_ADDRESS = "0x91bd00000000000000000000000000000000a821";
export const DEMO_HASH = `0x${"a2".repeat(32)}`;
