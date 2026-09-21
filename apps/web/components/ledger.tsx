import Link from "next/link";
import { ArrowDown, ArrowUp, Check, ChevronRight, Layers3 } from "lucide-react";
import { formatUSDC, canonicalSource } from "@arcledger/normalizer";
import type { ExplainedTransaction } from "@arcledger/types";
import { short } from "@/lib/format";
export function Pill({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: "green" | "neutral" | "amber";
}) {
  return <span className={`pill ${tone}`}>{children}</span>;
}
export function ModeNotice({ mode }: { mode: "demo" | "mainnet" }) {
  return mode === "demo" ? (
    <div className="demo-notice">
      <span className="demo-dot" />
      Sample ledger · Local demonstration data. Mainnet indexing is not active.
    </div>
  ) : (
    <div className="demo-notice">
      <span className="live-dot" />
      Arc Mainnet · Finalized records within indexed coverage.
    </div>
  );
}
export function Failure({ message }: { message: string }) {
  return (
    <section className="glass empty">
      <Layers3 size={28} />
      <h1>Ledger unavailable</h1>
      <p>{message}</p>
      <Link href="/" className="text-link">
        Back to search <ChevronRight size={15} />
      </Link>
    </section>
  );
}
export function Normalization({ tx }: { tx: ExplainedTransaction }) {
  const duplicates = tx.evidence.filter(
    (e) => e.disposition === "matched",
  ).length;
  const matchedRecords = new Set(
    tx.movements
      .filter((m) => m.evidence.length > 1)
      .flatMap((m) => m.evidence),
  ).size;
  return (
    <section className="glass normalization">
      <div className="section-heading">
        <div>
          <span className="eyebrow">FROM EVIDENCE TO ECONOMICS</span>
          <h2>
            {tx.movements.length === 1 && duplicates === 1
              ? "One movement. Two representations."
              : "From protocol records to movements."}
          </h2>
        </div>
        <Layers3 size={21} />
      </div>
      <p className="muted">
        Protocol records tell the story. The ledger counts it once.
      </p>
      <dl className="normalization-metrics">
        <div>
          <dt>Canonical source</dt>
          <dd>
            {canonicalSource(tx) === "eip7708"
              ? "EIP-7708"
              : canonicalSource(tx) === "mixed"
                ? "EIP-7708 + ERC-20 self"
                : canonicalSource(tx) === "erc20-self"
                  ? "ERC-20 self transfer"
                  : "No transfers"}
          </dd>
        </div>
        <div>
          <dt>Matched records</dt>
          <dd>{matchedRecords}</dd>
        </div>
        <div>
          <dt>Duplicate representations removed</dt>
          <dd>{duplicates}</dd>
        </div>
        <div>
          <dt>Result</dt>
          <dd>
            {tx.movements.length} canonical USDC{" "}
            {tx.movements.length === 1 ? "movement" : "movements"}
          </dd>
        </div>
      </dl>
      {tx.evidence.length === 0 && (
        <p className="muted">
          No USDC transfer records in this receipt. The network fee is recorded
          separately.
        </p>
      )}
      <div className="raw-heading eyebrow">RAW PROTOCOL RECORDS</div>
      <div className="raw-grid">
        {tx.evidence.map((e) => (
          <div className="raw-record" key={e.logIndex}>
            <div className="between">
              <span>
                {e.source === "native" ? "EIP-7708" : "ERC-20 Transfer"}
              </span>
              <span className="metadata">{e.decimals} decimals</span>
            </div>
            <strong className="mono raw-value">
              {(BigInt(e.rawAmount) / 10n ** BigInt(e.decimals)).toString()}.
              {(BigInt(e.rawAmount) % 10n ** BigInt(e.decimals))
                .toString()
                .padStart(e.decimals, "0")}{" "}
              <small>USDC</small>
            </strong>
            <div className="between">
              <Pill
                tone={
                  e.disposition === "unmatched"
                    ? "amber"
                    : e.disposition === "canonical"
                      ? "green"
                      : "neutral"
                }
              >
                {e.disposition === "canonical"
                  ? "CANONICAL ✓"
                  : e.disposition === "matched"
                    ? "Matched representation"
                    : e.disposition.toUpperCase()}
              </Pill>
              <span className="metadata">Log #{e.logIndex}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="merge-line">
        <span />
        <ArrowDown size={19} />
        <span />
      </div>
      <div className="canonical-result">
        <span className="eyebrow">ACTUAL ECONOMIC MOVEMENT</span>
        {tx.movements.length ? (
          tx.movements.map((m) => (
            <div key={m.id}>
              <strong>
                {formatUSDC(m.amount)} <small>USDC</small>
              </strong>
              {m.kind === "self" && (
                <p>Self transfer · 0 USDC transfer balance change</p>
              )}
              {tx.movements.length > 1 && (
                <p className="mono">
                  {short(m.from)} → {short(m.to)}
                </p>
              )}
            </div>
          ))
        ) : (
          <strong>No USDC movement</strong>
        )}
        <span className="result-note">
          <Check size={13} /> {tx.movements.length} canonical{" "}
          {tx.movements.length === 1 ? "movement" : "movements"} ·{" "}
          {tx.evidence.filter((e) => e.disposition === "matched").length}{" "}
          duplicate representations matched
        </span>
      </div>
      {tx.warnings.map((w) => (
        <p className="warning" key={w}>
          {w}
        </p>
      ))}
    </section>
  );
}
