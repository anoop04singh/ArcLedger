import Link from "next/link";
import { ArrowDown, ArrowUp, Check, ChevronRight, Layers3 } from "lucide-react";
import { formatUSDC } from "@arcledger/normalizer";
import type { ExplainedTransaction } from "@arcledger/types";
import { short } from "@/lib/api";
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
export function TransactionRow({
  tx,
  address,
}: {
  tx: ExplainedTransaction;
  address: string;
}) {
  const movements = tx.movements.filter(
    (m) => m.from === address || m.to === address,
  );
  const incoming = movements.reduce(
    (n, m) => n + (m.to === address ? BigInt(m.amount) : 0n),
    0n,
  );
  const outgoing = movements.reduce(
    (n, m) => n + (m.from === address ? BigInt(m.amount) : 0n),
    0n,
  );
  const received = incoming > outgoing,
    amount = received ? incoming - outgoing : outgoing - incoming;
  const m = movements[0];
  return (
    <Link className="transaction-row" href={`/tx/${tx.hash}`}>
      <span className={`direction ${received ? "incoming" : ""}`}>
        {received ? <ArrowDown size={19} /> : <ArrowUp size={19} />}
      </span>
      <div className="row-description">
        <strong>
          {!movements.length
            ? "Gas payment"
            : received
              ? "Received"
              : incoming === outgoing
                ? "Net zero"
                : "Sent"}
        </strong>
        <span className="mono">
          {m
            ? `${m.from === address ? "You" : short(m.from)} → ${m.to === address ? "You" : short(m.to)}`
            : short(tx.hash)}
          {movements.length > 1 ? ` · ${movements.length} movements` : ""}
        </span>
      </div>
      <div className="row-amount">
        <strong>
          {formatUSDC(amount)} <span>USDC</span>
        </strong>
        <span>
          {tx.sender === address
            ? `Fee ${formatUSDC(tx.fee)} USDC`
            : new Date(tx.timestamp).toLocaleString("en-GB", {
                timeZone: "UTC",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }) + " UTC"}
        </span>
      </div>
      <div className="row-status">
        <span>
          <Check size={13} /> Final
        </span>
        <small>
          {tx.status === "reverted"
            ? "Reverted"
            : `Block ${Number(tx.blockNumber).toLocaleString("en-US")}`}
        </small>
      </div>
      <ChevronRight size={16} className="muted" />
    </Link>
  );
}
export function Normalization({ tx }: { tx: ExplainedTransaction }) {
  return (
    <section className="glass normalization">
      <div className="section-heading">
        <div>
          <span className="eyebrow">FROM EVIDENCE TO ECONOMICS</span>
          <h2>One movement. Two representations.</h2>
        </div>
        <Layers3 size={21} />
      </div>
      <p className="muted">
        Protocol records tell the story. The ledger counts it once.
      </p>
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
                    ? "MATCHED"
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
