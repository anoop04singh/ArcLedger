import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Combine,
  ScanLine,
  Coins,
  Check,
} from "lucide-react";
import { SearchBar } from "@/components/search";
import { Enter } from "@/components/motion";
import { getStatus, DEMO_ADDRESS, DEMO_HASH } from "@/lib/api";
export const dynamic = "force-dynamic";
export default async function Home() {
  const status = await getStatus().catch(() => null);
  return (
    <Enter className="home">
      <section className="hero">
        <div className="hero-tag">
          <span />
          THE ACCOUNTING LAYER FOR ARC
        </div>
        <h1>ArcLedger</h1>
        <p className="hero-copy">The accounting layer for Arc USDC.</p>
        <p className="hero-description">
          Normalize native transfers, ERC-20 activity and gas
          <br className="desktop-break" /> into one canonical ledger.
        </p>
        <SearchBar />
        {status?.mode === "demo" ? (
          <div className="sample-links">
            <span>Explore sample data</span>
            <Link href={`/address/${DEMO_ADDRESS}`}>
              An address <ArrowUpRight size={13} />
            </Link>
            <span className="divider">/</span>
            <Link href={`/tx/${DEMO_HASH}`}>
              A transaction <ArrowUpRight size={13} />
            </Link>
          </div>
        ) : (
          <div className="sample-links">
            {status
              ? "Search your indexed Arc Mainnet ledger"
              : "Start the local API to search your ledger"}
          </div>
        )}
      </section>
      <section className="capabilities" aria-label="Capabilities">
        {[
          {
            Icon: Combine,
            title: "Canonical Transfers",
            text: "Remove duplicate protocol representations.",
            meta: "One movement, counted once",
          },
          {
            Icon: Coins,
            title: "USDC Accounting",
            text: "Normalize native and ERC-20 precision.",
            meta: "18 decimals. Zero lost precision.",
          },
          {
            Icon: ScanLine,
            title: "Transaction Explain",
            text: "Understand what actually moved.",
            meta: "Every number, backed by evidence",
          },
        ].map(({ Icon, title, text, meta }, i) => (
          <div className="glass capability" key={title}>
            <div className="between">
              <span className="icon-box">
                <Icon size={21} strokeWidth={1.5} />
              </span>
              <span className="card-index">0{i + 1}</span>
            </div>
            <h2>{title}</h2>
            <p>{text}</p>
            <div className="capability-meta">
              <Check size={13} />
              {meta}
            </div>
          </div>
        ))}
      </section>
      <div className="home-status">
        <span
          className={
            status?.mode === "mainnet" && status.state === "live"
              ? "live-dot"
              : "demo-dot"
          }
        />
        {status?.mode === "demo"
          ? "Local demo · Sample data"
          : status
            ? `Indexer ${status.state}`
            : "Ledger service offline"}
        <span className="status-divider" />
        Native USDC. A single source of truth.
        <Link href="/status">
          View status <ArrowRight size={14} />
        </Link>
      </div>
    </Enter>
  );
}
