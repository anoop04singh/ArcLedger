"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowUpRight,
  Pause,
  Play,
  RefreshCw,
  ArrowRight,
  Search,
  Check,
} from "lucide-react";
import { RetentionNotice } from "./retention-notice";
import type { PublicStatus } from "@arcledger/types";
import { short } from "@/lib/format";
export function LiveExplorer({ initial }: { initial: PublicStatus | null }) {
  const [data, setData] = useState(initial),
    [paused, setPaused] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(
      initial ? "" : "Live data could not be loaded. Try refreshing.",
    ),
    [updated, setUpdated] = useState<string | null>(null),
    [filter, setFilter] = useState("all");
  const pending = useRef(false);
  const reduce = useReducedMotion();
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/explorer", {
        cache: "no-store",
        signal: signal ?? AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw new Error(
          "Live refresh unavailable. Showing the last successful snapshot.",
        );
      const next: PublicStatus = await response.json();
      setData(next);
      setError("");
      setUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      if (!signal?.aborted) setError((e as Error).message);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    if (paused) return;
    const c = new AbortController();
    const tick = () => {
      if (document.visibilityState === "visible") void refresh(c.signal);
    };
    tick();
    const timer = setInterval(tick, 15000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      c.abort();
    };
  }, [paused, refresh]);
  const rows = (data?.recentTransactions ?? []).filter(
    (t) =>
      filter === "all" ||
      (filter === "matched" && t.duplicates > 0) ||
      (filter === "fees" && t.movements === 0),
  );
  const number = (v: unknown) =>
    v === null || v === undefined
      ? "—"
      : BigInt(String(v)).toLocaleString("en-US");
  return (
    <div className="live-explorer">
      <div className="explorer-toolbar">
        <div className="feed-state">
          <span
            className={
              data?.state === "live" && !error ? "live-dot" : "demo-dot"
            }
          />
          <strong>
            {data?.mode === "demo"
              ? "Demo data"
              : data
                ? `Indexer ${data.state}`
                : "Connection unavailable"}
          </strong>
          <span>
            {paused
              ? "Refresh paused"
              : error
                ? "Refresh interrupted"
                : "Auto-refresh · 15s"}
          </span>
        </div>
        <div className="feed-controls">
          <button
            onClick={() => setPaused((p) => !p)}
            className="quiet-button"
            aria-label={paused ? "Resume live updates" : "Pause live updates"}
          >
            {paused ? <Play size={14} /> : <Pause size={14} />}
            <span>{paused ? "Resume" : "Pause"}</span>
          </button>
          <button
            className="quiet-button"
            onClick={() => void refresh()}
            disabled={busy}
            aria-label="Refresh explorer"
          >
            <RefreshCw size={14} className={busy ? "refreshing" : ""} />
            <span>Refresh</span>
          </button>
        </div>
      </div>
      {error && (
        <p className="feed-error" role="alert">
          {error}
        </p>
      )}
      <div className="explorer-stats">
        {[
          {
            label: "Chain head",
            value: data?.latestChainBlock,
            note: "Fresh Arc RPC read",
            color: "violet",
          },
          {
            label: "Indexed block",
            value: data?.latestIndexedBlock,
            note:
              data?.lag == null
                ? "Waiting for checkpoint"
                : `${number(data.lag)} blocks behind head`,
            color: "mint",
          },
          {
            label: "Canonical records",
            value: data?.canonicalTransfers,
            note: "Within indexed coverage",
            color: "orange",
          },
          {
            label: "Duplicates matched",
            value: data?.duplicatesRemoved,
            note: "Raw evidence stays intact",
            color: "blue",
          },
        ].map((m) => (
          <div className={`glass explorer-stat ${m.color}`} key={m.label}>
            <span>{m.label}</span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.strong
                key={String(m.value)}
                initial={{ opacity: 0, y: reduce ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {number(m.value)}
              </motion.strong>
            </AnimatePresence>
            <small>{m.note}</small>
          </div>
        ))}
      </div>
      <RetentionNotice
        retention={data?.retention}
        startBlock={data?.startBlock ?? null}
      />
      <section className="glass transaction-feed">
        <div className="feed-heading">
          <div>
            <span className="eyebrow">THE LEDGER, AS IT GROWS</span>
            <h2>Recently indexed transactions</h2>
          </div>
          <span className="feed-count">Latest 12</span>
        </div>
        <div
          className="feed-tabs"
          role="group"
          aria-label="Filter recent transactions"
        >
          {[
            { id: "all", label: "All activity" },
            { id: "matched", label: "Matched records" },
            { id: "fees", label: "Fee only" },
          ].map((f) => (
            <button
              key={f.id}
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
          <span>{updated ? `Updated ${updated}` : "Waiting for refresh"}</span>
        </div>
        <div className="feed-columns">
          <span>Transaction / participants</span>
          <span>Transfer volume</span>
          <span>Block / time (UTC)</span>
          <span>Result</span>
        </div>
        <div aria-live="polite" aria-relevant="additions">
          <AnimatePresence initial={false}>
            {rows.map((tx) => (
              <motion.div
                layout={!reduce}
                initial={{ opacity: 0, y: reduce ? 0 : -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                key={tx.hash}
                className="feed-row"
              >
                <div className="feed-identity">
                  <Link className="feed-hash mono" href={`/tx/${tx.hash}`}>
                    {short(tx.hash)}
                    <ArrowUpRight size={14} />
                  </Link>
                  <div className="feed-parties">
                    <Link href={`/address/${tx.from}`}>{short(tx.from)}</Link>
                    <ArrowRight size={11} />
                    {tx.to ? (
                      <Link href={`/address/${tx.to}`}>{short(tx.to)}</Link>
                    ) : (
                      <span>
                        {tx.movements > 1 ? `${tx.movements} records` : "—"}
                      </span>
                    )}
                  </div>
                </div>
                <div className="feed-amount">
                  <strong>
                    {tx.amount}
                    <small> USDC</small>
                  </strong>
                  <span>Fee {tx.fee}</span>
                </div>
                <div className="feed-block">
                  <span className="mono">{number(tx.blockNumber)}</span>
                  <time dateTime={tx.timestamp}>
                    {new Date(tx.timestamp)
                      .toISOString()
                      .slice(5, 19)
                      .replace("T", " · ")}
                  </time>
                </div>
                <div className="feed-result">
                  <span
                    className={`feed-pill ${tx.status === "reverted" ? "reverted" : ""}`}
                  >
                    <Check size={11} />
                    {tx.status === "reverted" ? "Reverted" : "Final"}
                  </span>
                  <small>
                    {tx.duplicates
                      ? `${tx.duplicates} duplicate${tx.duplicates > 1 ? "s" : ""} matched`
                      : tx.movements
                        ? "Canonical"
                        : "Fee only"}
                  </small>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {!rows.length && (
          <div className="feed-empty">
            <Search size={22} />
            <h3>
              {data ? "No transactions in this view" : "Waiting for the ledger"}
            </h3>
            <p>
              {data
                ? "Try another filter. New normalized transactions appear as the indexer and ledger worker process blocks."
                : "Check the API connection, then refresh."}
            </p>
          </div>
        )}
        <div className="feed-foot">
          <span>
            {data?.mode === "demo"
              ? "Synthetic examples · not live Mainnet activity"
              : `Finalized, normalized records · coverage starts at ${data?.startBlock ?? "—"}`}
          </span>
          <Link href="/validation">
            Verify the ledger <ArrowUpRight size={13} />
          </Link>
        </div>
      </section>
      {data?.state !== "live" && data?.mode === "mainnet" && (
        <p className="coverage-note">
          Live refresh is active when unpaused. These are the latest records in
          this database, which may be behind the chain. Indexer state and lag
          are shown above.
        </p>
      )}
    </div>
  );
}
