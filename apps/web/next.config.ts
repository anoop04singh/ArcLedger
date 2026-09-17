import type { NextConfig } from "next";
import path from "node:path";
const config: NextConfig = {
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  transpilePackages: [
    "@arcledger/types",
    "@arcledger/arc-config",
    "@arcledger/normalizer",
  ],
  devIndicators: false,
};
export default config;
