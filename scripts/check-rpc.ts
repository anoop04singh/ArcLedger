import { createArcClient, verifyChain } from "@arcledger/arc-config";
const client = createArcClient();
await verifyChain(client);
const block = await client.getBlock({ blockTag: "finalized" });
console.log(
  JSON.stringify(
    {
      chain: "Arc Mainnet",
      finalizedBlock: block.number.toString(),
      hash: block.hash,
    },
    null,
    2,
  ),
);
