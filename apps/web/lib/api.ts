import type {
  AddressSummary,
  PublicLedger,
  ExplainedTransaction,
  PublicStatus,
} from "@arcledger/types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public database?: string,
  ) {
    super(message);
  }
}
async function request<T>(path: string): Promise<T> {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://127.0.0.1:3001";
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
    throw new ApiError(
      response.status,
      body.error ?? "Unable to load ledger",
      body.database,
    );
  }
  return response.json();
}
export const getStatus = () => request<PublicStatus>("/status");
export const getAddress = async (
  address: string,
  cursor?: string,
  limit = "20",
) => {
  const [summary, ledger] = await Promise.all([
    request<AddressSummary>(`/address/${encodeURIComponent(address)}`),
    request<PublicLedger>(
      `/address/${encodeURIComponent(address)}/ledger?limit=${encodeURIComponent(limit)}${cursor ? "&cursor=" + encodeURIComponent(cursor) : ""}`,
    ),
  ]);
  return { ...summary, ...ledger, transactionCount: summary.transactions };
};
export const getTransaction = async (hash: string) => {
  const result = await request<{
    explanation: ExplainedTransaction;
    mode: "demo" | "mainnet";
  }>(`/tx/${encodeURIComponent(hash)}`);
  return { ...result.explanation, mode: result.mode };
};
export { short } from "./format";
export const DEMO_ADDRESS = "0x91bd00000000000000000000000000000000a821";
export const DEMO_HASH = `0x${"a2".repeat(32)}`;
