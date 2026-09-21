import { RetentionNotice } from "@/components/retention-notice";
import { ArrowUpRight, Database, Radio } from "lucide-react";
import { getStatus, ApiError } from "@/lib/api";
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
        {e instanceof ApiError && e.database && (
          <section className="glass status-metric">
            <span>Database</span>
            <strong>{e.database.toUpperCase()}</strong>
            <small>Live backend connection check failed</small>
          </section>
        )}
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
      <RetentionNotice retention={s.retention} startBlock={s.startBlock} />
      {(s.pendingNormalization ?? 0) > 0 && (
        <p className="demo-notice">
          {s.pendingNormalization} raw transactions await normalization.
          Canonical totals currently cover processed projections only.
        </p>
      )}
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
            label: "Database",
            value: s.database === "healthy" ? "HEALTHY" : "NOT CONFIGURED",
            note:
              s.mode === "demo"
                ? "Demo mode does not use a database"
                : "Live PostgreSQL connection check",
          },
          {
            label: "Arc RPC",
            value: s.rpc.toUpperCase().replace("-", " "),
            note: "Fresh chain-head connectivity check",
          },
          {
            label: "Latest Arc block",
            value:
              s.latestChainBlock === null
                ? "—"
                : Number(s.latestChainBlock).toLocaleString("en-US"),
            note: "Current committed chain head",
          },
          ...(s.mode === "mainnet"
            ? [
                {
                  label: "Raw transactions",
                  value: s.rawTransactions ?? 0,
                  note: "Full transaction and receipt payloads",
                },
                {
                  label: "Raw events",
                  value: s.rawEvents ?? 0,
                  note: "All emitters retained for auditing",
                },
                {
                  label: "Awaiting normalization",
                  value: s.pendingNormalization ?? 0,
                  note: `Raw coverage starts at ${s.rawCoverageStart ?? "—"}`,
                },
              ]
            : []),
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
            note: s.validationRun
              ? `Sample ${s.validationRun.startBlock}–${s.validationRun.endBlock}`
              : "Validation has not run",
          },
          {
            label: "Normalization warnings",
            value: s.normalizationWarnings,
            note: "Unmatched ERC-20 representations",
          },
        ].map((item) => (
          <div className="glass status-metric" key={item.label}>
            <span>{item.label}</span>
            <strong
              className={
                typeof item.value === "string" && /[a-z]/i.test(item.value)
                  ? "metric-text"
                  : undefined
              }
            >
              {item.value}
            </strong>
            <small>{item.note}</small>
          </div>
        ))}
      </section>
      <section className="glass validation">
        <div className="section-heading">
          <h2>
            <Database size={19} /> Validation coverage
          </h2>
          <Pill tone={s.validation === "valid" ? "green" : "amber"}>
            {s.validation.toUpperCase().replace("-", " ")}
          </Pill>
        </div>
        {s.validationRun ? (
          <>
            <p>{s.validationRun.scope}</p>
            <p>
              Blocks {s.validationRun.startBlock}–{s.validationRun.endBlock} ·
              Completed{" "}
              {new Date(s.validationRun.completedAt).toLocaleString("en-US", {
                timeZone: "UTC",
              })}{" "}
              UTC. These results describe this sample at validation time; they
              do not certify later blocks.
            </p>
            <div className="validation-items">
              <span>{s.validationRun.blocksScanned} blocks scanned</span>
              <span>{s.validationRun.transactions} transactions</span>
              <span>{s.validationRun.rawRecords} raw USDC records</span>
              <span>
                {s.validationRun.canonicalMovements} canonical movements
              </span>
              <span>{s.validationRun.duplicateRecords} matched duplicates</span>
              <span>
                {s.validationRun.status === "error"
                  ? "—"
                  : s.validationRun.feeMismatches}{" "}
                fee mismatches
              </span>
            </div>
            {s.validationRun.issues.length > 0 && (
              <details>
                <summary>
                  Validation findings ({s.validationRun.issues.length})
                </summary>
                <ul>
                  {s.validationRun.issues.map((issue, i) => (
                    <li key={i} className="break-anywhere">
                      {issue}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        ) : (
          <p>
            No Mainnet validation has run. Indexing health is separate from
            accounting validation. No accounting result is asserted until a
            sample is checked.
          </p>
        )}
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
