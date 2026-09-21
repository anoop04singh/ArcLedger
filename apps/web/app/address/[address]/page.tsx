import Link from "next/link";
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ReceiptText,
  Hash,
} from "lucide-react";

import { getAddress, short } from "@/lib/api";
import { Enter } from "@/components/motion";
import { CopyButton } from "@/components/copy";
import { Failure, ModeNotice } from "@/components/ledger";
import { AddressHistory } from "@/components/address-history";
export default async function AddressPage({
  params,
  searchParams,
}: {
  params: Promise<{ address: string }>;
  searchParams: Promise<{ cursor?: string; limit?: string }>;
}) {
  const { address } = await params;
  const { cursor, limit } = await searchParams;
  let ledger;
  try {
    ledger = await getAddress(address, cursor, limit);
  } catch (e) {
    return (
      <div className="detail">
        <Failure message={(e as Error).message} />
      </div>
    );
  }
  return (
    <Enter className="detail">
      <Link className="back-link" href="/explorer">
        <ArrowLeft size={15} /> Back to explorer
      </Link>
      <ModeNotice mode={ledger.mode} />
      {(ledger.pendingNormalization ?? 0) > 0 && (
        <p className="demo-notice">
          Normalization is pending for {ledger.pendingNormalization} indexed
          transactions. Received, sent, and history below cover completed
          projections only; fees include captured receipts.
        </p>
      )}
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
            {ledger.balance === null ? "Unavailable" : ledger.balance}{" "}
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
              value: ledger.received,
            },
            {
              Icon: ArrowUpRight,
              label: "Sent",
              value: ledger.sent,
            },
            {
              Icon: ReceiptText,
              label: "Fees paid",
              value: ledger.feesPaid,
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
        <AddressHistory
          key={`${ledger.address}:${cursor ?? ""}`}
          initial={{
            address: ledger.address,
            network: ledger.network,
            currency: ledger.currency,
            mode: ledger.mode,
            entries: ledger.entries,
            nextCursor: ledger.nextCursor,
          }}
        />
      </section>
    </Enter>
  );
}
