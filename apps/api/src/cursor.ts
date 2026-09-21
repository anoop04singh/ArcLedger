import { z } from "zod";
import type { LedgerPosition } from "@arcledger/types";
const schema = z
  .object({
    v: z.literal(1),
    address: z.string().regex(/^0x[0-9a-f]{40}$/),
    mode: z.enum(["demo", "mainnet"]),
    snapshot: z
      .string()
      .regex(/^\d{1,19}$/)
      .refine((v) => BigInt(v) <= 9223372036854775807n),
    after: z.object({
      block: z.string().regex(/^\d{1,78}$/),
      transactionIndex: z.number().int().min(0).max(2147483647),
      hash: z.string().regex(/^0x[0-9a-f]{64}$/),
      entryIndex: z.number().int().min(0).max(2147483647),
    }),
  })
  .strict();
export function decodeCursor(
  cursor: string,
  address: string,
  mode: "demo" | "mainnet",
) {
  if (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor))
    throw new Error("Invalid cursor");
  const result = schema.parse(
    JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
  );
  if (result.address !== address || result.mode !== mode)
    throw new Error("Cursor belongs to another address or mode");
  return result;
}
export function encodeCursor(
  address: string,
  mode: "demo" | "mainnet",
  snapshot: string,
  after: LedgerPosition,
) {
  return Buffer.from(
    JSON.stringify({ v: 1, address, mode, snapshot, after }),
  ).toString("base64url");
}
