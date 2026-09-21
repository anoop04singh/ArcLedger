import Link from "next/link";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { formatUSDC } from "@arcledger/normalizer";
import { getTransaction, short } from "@/lib/api";
import { CopyButton } from "@/components/copy";
import { Enter } from "@/components/motion";
import { Failure, ModeNotice, Normalization, Pill } from "@/components/ledger";
export default async function TransactionPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  let tx;
  try {
    tx = await getTransaction(hash);
  } catch (e) {
    return (
      <div className="detail">
        <Failure message={(e as Error).message} />
      </div>
    );
  }
  const m = tx.movements[0];
  return (
    <Enter className="detail">
      <Link className="back-link" href="/explorer">
        <ArrowLeft size={15} /> Back to explorer
      </Link>
      <ModeNotice mode={tx.mode} />
      <section className="glass tx-panel">
        <div className="between">
          <span className="eyebrow">TRANSACTION EXPLAIN</span>
          <Pill>
            FINAL <Check size={12} />
          </Pill>
        </div>
        <h1 className="tx-amount">
          {tx.movements.length === 1
            ? formatUSDC(m.amount)
            : tx.movements.length === 0
              ? "No transfer"
              : `${tx.movements.length} movements`}
          {tx.movements.length === 1 && <span> USDC</span>}
        </h1>
        {m && tx.movements.length === 1 && (
          <div className="tx-parties">
            <Link className="mono" href={`/address/${m.from}`}>
              {short(m.from)}
            </Link>
            <ArrowRight size={17} />
            <Link className="mono" href={`/address/${m.to}`}>
              {short(m.to)}
            </Link>
          </div>
        )}
        <p className="tx-caption">
          {tx.status === "reverted"
            ? "Transaction reverted. Only gas was charged."
            : "Finalized on Arc. Economic movements normalized."}
        </p>
        <div className="tx-metadata">
          <div>
            <span>Block</span>
            <strong>{Number(tx.blockNumber).toLocaleString("en-US")}</strong>
          </div>
          <div>
            <span>Timestamp (UTC)</span>
            <strong>
              {new Date(tx.timestamp)
                .toISOString()
                .replace("T", " ")
                .replace(".000Z", "")}
            </strong>
          </div>
          <div>
            <span>Gas fee</span>
            <strong>{formatUSDC(tx.fee)} USDC</strong>
          </div>
          <div className="hash-field">
            <span>Transaction hash</span>
            <strong className="mono">
              {tx.hash}
              <CopyButton value={tx.hash} />
            </strong>
          </div>
          <div className="hash-field">
            <span>Fee payer</span>
            <Link className="mono" href={`/address/${tx.sender}`}>
              {tx.sender}
            </Link>
          </div>
        </div>
      </section>
      <Normalization tx={tx} />
      <p className="footnote">
        Gas is recorded separately from transfers. All ledger amounts retain
        native 18-decimal precision.
      </p>
    </Enter>
  );
}
