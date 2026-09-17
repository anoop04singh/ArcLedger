import { Activity, ArrowUpRight, Check, Database, Radio } from "lucide-react";
import { getStatus } from "@/lib/api";
import { Enter } from "@/components/motion";
import { Failure, ModeNotice, Pill } from "@/components/ledger";
export const dynamic = "force-dynamic";
export default async function StatusPage() {
  let s;
  try {
    s = await getStatus();
  } catch (e) {
    return (
      <div className="detail">
        <Failure message={(e as Error).message} />
      </div>
    );
  }
  return (
    <Enter className="detail status-page">
      <div className="page-heading">
        <span className="eyebrow">OBSERVABILITY</span>
        <h1>A ledger you can verify.</h1>
        <p>Indexing health, normalization, and accounting integrity.</p>
      </div>
      <ModeNotice mode={s.mode} />
      <section className="glass status-banner">
        <span className="icon-box">
          <Radio size={24} />
        </span>
        <div>
          <span className="eyebrow">INDEXER STATUS</span>
          <h2>
            {s.state === "demo"
              ? "Local demonstration"
              : s.state === "live"
                ? "Up to date"
                : s.state === "idle"
                  ? "Awaiting first block"
                  : s.state === "stale"
                    ? "Indexer heartbeat stale"
                    : "Catching up"}
          </h2>
        </div>
        <Pill tone={s.state === "live" ? "green" : "amber"}>
          {s.state.toUpperCase()}
        </Pill>
      </section>
      <section className="status-grid">
        {[
          {
            label: "Latest indexed block",
            value:
              s.latestIndexedBlock === null
                ? "—"
                : Number(s.latestIndexedBlock).toLocaleString("en-US"),
            note: `Coverage starts at ${s.startBlock ?? "—"}`,
          },
          {
            label: "Indexer lag",
            value: s.lag === null ? "—" : `${s.lag}`,
            note: "Blocks behind observed finalized head",
          },
          {
            label: "Canonical transfers",
            value: s.canonicalTransfers.toLocaleString("en-US"),
            note: "Unique economic movements",
          },
          {
            label: "Duplicate records removed",
            value: s.duplicatesRemoved.toLocaleString("en-US"),
            note: "Evidence retained, never double-counted",
          },
          {
            label: "Accounting mismatches",
            value: s.accountingMismatches ?? "—",
            note: "Balance reconciliation has not run",
          },
          {
            label: "Normalization warnings",
            value: s.normalizationWarnings,
            note: "Unmatched ERC-20 representations",
          },
        ].map((item) => (
          <div className="glass status-metric" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </section>
      <section className="glass validation">
        <div className="section-heading">
          <h2>
            <Database size={19} /> Validation coverage
          </h2>
          <Pill tone="neutral">NOT RUN</Pill>
        </div>
        <p>
          Indexing health is separate from accounting validation. This
          foundation does not yet reconcile historical balances or validator
          rewards. Mainnet accounting is not certified.
        </p>
        <div className="validation-items">
          <span>
            <Check size={15} /> Integer-only amount normalization
          </span>
          <span>
            <Check size={15} /> One-to-one evidence matching
          </span>
          <span>
            <Activity size={15} /> Balance reconciliation pending
          </span>
        </div>
        <a
          className="text-link"
          href="https://docs.arc.io/arc/references/usdc-system-events"
          target="_blank"
          rel="noreferrer"
        >
          Arc event reference <ArrowUpRight size={14} />
        </a>
      </section>
    </Enter>
  );
}
