import type { AddressLedger } from "@arcledger/types";
const address = process.argv[2] ?? "0x91bd00000000000000000000000000000000a821";
const response = await fetch(
  `${process.env.API_URL ?? "http://127.0.0.1:3001"}/v1/addresses/${encodeURIComponent(address)}`,
);
if (!response.ok) throw new Error(`Ledger API returned ${response.status}`);
const ledger: AddressLedger = await response.json();
console.log({
  mode: ledger.mode,
  address: ledger.address,
  balanceNativeUnits: ledger.balance,
  transactions: ledger.transactionCount,
});
