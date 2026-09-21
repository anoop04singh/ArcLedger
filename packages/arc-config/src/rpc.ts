function isRateLimited(error: unknown) {
  return (
    error instanceof Error &&
    /rate limit|exceeds defined limit|429/i.test(error.message)
  );
}
import { createPublicClient, http, custom } from "viem";
import { ARC_MAINNET, arc } from "./index.js";
export type RpcRequest = { method: string; params?: readonly unknown[] };
export type RpcRequester = (request: RpcRequest) => Promise<unknown>;
export class RpcUnavailableError extends Error {
  constructor(public rateLimited = false) {
    super(
      rateLimited
        ? "Arc RPC rate limit reached; retry the same block."
        : "Arc RPC unavailable; retry the same block.",
    );
    this.name = "RpcUnavailableError";
  }
}
export class ChainMismatchError extends Error {
  constructor() {
    super("RPC endpoint is not Arc Mainnet");
    this.name = "ChainMismatchError";
  }
}
/** Always try primary first. No racing, ranking, weighted routing or load balancing. */
export class ArcRpc {
  private verified = new Map<RpcRequester, Promise<void>>();
  readonly metrics = { requests: 0, failovers: 0 };
  constructor(
    private primary: RpcRequester,
    private fallback?: RpcRequester,
  ) {}
  private async attempt(endpoint: RpcRequester, request: RpcRequest) {
    let check = this.verified.get(endpoint);
    if (!check) {
      check = (async () => {
        const id = await endpoint({ method: "eth_chainId" });
        if (
          typeof id !== "string" ||
          BigInt(id) !== BigInt(ARC_MAINNET.chainId)
        )
          throw new ChainMismatchError();
      })();
      this.verified.set(endpoint, check);
    }
    try {
      await check;
    } catch (error) {
      this.verified.delete(endpoint);
      throw error;
    }
    const result = await endpoint(request);
    if (result === null || result === undefined)
      throw new RpcUnavailableError();
    return result;
  }
  async request(request: RpcRequest): Promise<unknown> {
    this.metrics.requests++;
    try {
      return await this.attempt(this.primary, request);
    } catch (primaryError) {
      if (!this.fallback) {
        if (primaryError instanceof ChainMismatchError) throw primaryError;
        throw new RpcUnavailableError(isRateLimited(primaryError));
      }
      this.metrics.failovers++;
      try {
        return await this.attempt(this.fallback, request);
      } catch (fallbackError) {
        if (fallbackError instanceof ChainMismatchError) throw fallbackError;
        throw new RpcUnavailableError(isRateLimited(fallbackError));
      }
    }
  }
  async blockNumber() {
    return BigInt(
      (await this.request({ method: "eth_blockNumber" })) as string,
    );
  }
  async balance(address: string, block: bigint) {
    return BigInt(
      (await this.request({
        method: "eth_getBalance",
        params: [address, `0x${block.toString(16)}`],
      })) as string,
    );
  }
}
export function createArcRpc(
  primaryUrl = process.env.PRIMARY_RPC_URL ||
    process.env.ARC_RPC_URL ||
    ARC_MAINNET.rpcUrl,
  fallbackUrl = (process.env.FALLBACK_RPC_URL ??
    process.env.ARC_FALLBACK_RPC_URL ??
    ARC_MAINNET.fallbackRpcUrl) ||
    undefined,
) {
  const endpoint = (url: string) => {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol))
      throw new Error("RPC URL must be HTTP(S)");
    const client = createPublicClient({
      chain: arc,
      transport: http(url, {
        timeout: 4000,
        retryCount: 0,
        batch: { wait: 0, batchSize: 8 },
      }),
    });
    return client.request as unknown as RpcRequester;
  };
  return new ArcRpc(
    endpoint(primaryUrl),
    fallbackUrl ? endpoint(fallbackUrl) : undefined,
  );
}
export function rpcTransport(rpc: ArcRpc) {
  return custom(
    { request: (args) => rpc.request(args as RpcRequest) },
    { retryCount: 0 },
  );
}
