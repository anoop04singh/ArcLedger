import { createPublicClient, defineChain } from "viem";
import { createArcRpc, rpcTransport } from "./rpc.js";
export {
  ArcRpc,
  createArcRpc,
  RpcUnavailableError,
  ChainMismatchError,
} from "./rpc.js";
export type { RpcRequester, RpcRequest } from "./rpc.js";
export const ARC_MAINNET = Object.freeze({
  chainId: 5042,
  rpcUrl: "https://rpc.mainnet.arc.io",
  fallbackRpcUrl: "https://rpc.drpc.mainnet.arc.io",
  usdc: "0x3600000000000000000000000000000000000000" as const,
  systemEmitter: "0xfffffffffffffffffffffffffffffffffffffffe" as const,
  transferTopic:
    "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef" as const,
  zeroAddress: "0x0000000000000000000000000000000000000000" as const,
  nativeDecimals: 18,
  erc20Decimals: 6,
  decimalOffset: 12,
});
export const DECIMAL_SCALE = 10n ** BigInt(ARC_MAINNET.decimalOffset);
export const arc = defineChain({
  id: ARC_MAINNET.chainId,
  name: "Arc Mainnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_MAINNET.rpcUrl] } },
});
export function createArcClient(
  url = process.env.PRIMARY_RPC_URL ||
    process.env.ARC_RPC_URL ||
    ARC_MAINNET.rpcUrl,
) {
  return createPublicClient({
    chain: arc,
    transport: rpcTransport(createArcRpc(url)),
  });
}
export async function verifyChain(client: ReturnType<typeof createArcClient>) {
  const id = await client.getChainId();
  if (id !== ARC_MAINNET.chainId)
    throw new Error(
      `Expected Arc Mainnet ${ARC_MAINNET.chainId}, received ${id}`,
    );
}
export function readMode(): "demo" | "mainnet" {
  const mode = process.env.ARCLEDGER_MODE ?? "demo";
  if (mode !== "demo" && mode !== "mainnet")
    throw new Error("ARCLEDGER_MODE must be demo or mainnet");
  return mode;
}
