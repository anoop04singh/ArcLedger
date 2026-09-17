import Link from "next/link";
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ReceiptText,
  Hash,
} from "lucide-react";
import { formatUSDC } from "@arcledger/normalizer";
import { getAddress, short } from "@/lib/api";
import { Enter } from "@/components/motion";
import { CopyButton } from "@/components/copy";
import { Failure, ModeNotice, TransactionRow } from "@/components/ledger";
export default async function AddressPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ offset?: string }>;
}) {
  const { address } = await params;
  const { offset = "0" } = await searchParams;
  let ledger;
  try {
    ledger = await getAddress(address, Number(offset));
  } catch (e) {
    return (
      <div className="detail">
        <Failure message={(e as Error).message} />
      </div>
    );
  }
  return (
    <Enter className="detail">
      <Link className="back-link" href="/">
        <ArrowLeft size={15} /> Back to explorer
      </Link>
      <ModeNotice mode={ledger.mode} />
      <section className="glass balance-panel">
        <div className="between">
          <div className="address-title">
            <span className="icon-box">
              <Wallet size={22} />
            </span>
            <div>
              <span className="eyebrow">ADDRESS OVERVIEW</span>
              <h1 className="mono" title={address}>
                {short(address)} <CopyButton value={address} />
              </h1>
            </div>
          </div>
          <span className="subtle-label">USDC · Arc</span>
        </div>
        <div className="balance">
          <span className="muted">Current balance</span>
          <div>
            {ledger.balance === null
              ? "Unavailable"
              : formatUSDC(ledger.balance)}{" "}
            <span>USDC</span>
          </div>
          <small className="muted">
            {ledger.balanceBlock
              ? `At finalized block ${Number(ledger.balanceBlock).toLocaleString("en-US")}`
              : "No balance snapshot available"}
          </small>
        </div>
        <div className="metrics">
          {[
            {
              Icon: ArrowDownLeft,
              label: "Received",
              value: formatUSDC(ledger.received),
            },
            {
              Icon: ArrowUpRight,
              label: "Sent",
              value: formatUSDC(ledger.sent),
            },
            {
              Icon: ReceiptText,
              label: "Fees paid",
              value: formatUSDC(ledger.feesPaid),
            },
            {
              Icon: Hash,
              label: "Transactions",
              value: ledger.transactionCount.toString(),
            },
          ].map(({ Icon, label, value }) => (
            <div key={label}>
              <span>
                <Icon size={14} />
                {label}
              </span>
              <strong>{value}</strong>
              {label !== "Transactions" && <small>USDC</small>}
            </div>
          ))}
        </div>
      </section>
      <section className="history">
        <div className="section-heading">
          <h2>Transaction history</h2>
          <span className="metadata">
            {ledger.transactionCount} transactions
          </span>
        </div>
        <p className="coverage">
          Totals cover indexed blocks {ledger.coverageStart ?? "—"} onward.
          Current balance is a separate snapshot.
        </p>
        <div className="transaction-list">
          {ledger.transactions.length ? (
            ledger.transactions.map((tx) => (
              <TransactionRow tx={tx} address={ledger.address} key={tx.hash} />
            ))
          ) : (
            <div className="empty">
              <ReceiptText size={26} />
              <h2>No indexed transactions</h2>
              <p>This address has no activity in the current indexed range.</p>
            </div>
          )}
        </div>
        <div className="pagination">
          {Number(offset) > 0 && (
            <Link
              href={`/address/${address}?offset=${Math.max(0, Number(offset) - 20)}`}
            >
              ← Previous
            </Link>
          )}
          {ledger.nextOffset !== null && (
            <Link href={`/address/${address}?offset=${ledger.nextOffset}`}>
              Next →
            </Link>
          )}
        </div>
      </section>
    </Enter>
  );
}
