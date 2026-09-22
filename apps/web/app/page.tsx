import type { Metadata } from "next";
import Link from "next/link";
import {
  Layers3,
  Hash,
  ReceiptText,
  FileSearch,
  ShieldCheck,
  RotateCcw,
  ArrowUpRight,
  Check,
} from "lucide-react";
import { SearchBar } from "@/components/search";
import { Enter, Reveal } from "@/components/motion";
import { NormalizationDemo } from "@/components/normalization-demo";
import {
  ApiPreview,
  CopyCode,
  FAQ,
  MagneticLink,
  ScrambleHeadline,
  ScrollWords,
  SignatureMerge,
  Steps,
} from "@/components/landing-motion";
const repo = "https://github.com/anoop04singh/ArcLedger";
export const metadata: Metadata = {
  title: { absolute: "ArcLedger: One Ledger for Arc USDC" },
  description:
    "Arc shows USDC in two ways, so most tools count it twice. ArcLedger counts every dollar once. Open source, exact to the last digit.",
};
const features = [
  [
    Layers3,
    "Counted once, never twice",
    "Native and ERC-20 records are matched exactly, so matched representations never double-count volume.",
  ],
  [
    Hash,
    "Exact to the last digit",
    "All values use big integers and exact decimal strings. No rounding, no floating-point errors.",
  ],
  [
    ReceiptText,
    "Gas fees, separated",
    "Fees come straight from receipts and are shown apart from transfers. Failed transactions and relayer-paid fees are handled correctly.",
  ],
  [
    FileSearch,
    "Full audit trail",
    "Raw transactions, receipts and logs are kept within the retained window. Add ?includeRaw=true to the transaction endpoint to see the evidence. Self-transfers get an audit record with zero balance change.",
  ],
  [
    ShieldCheck,
    "Independently validated",
    "A separate validator re-fetches fresh data from Arc, decodes it on its own, and checks it against the ledger. VALID, INVALID or ERROR results are stored and visible in the UI.",
  ],
  [
    RotateCcw,
    "Built to recover",
    "Raw data and its checkpoint are saved together. If a worker crashes or restarts, it picks up cleanly without ingestion gaps or duplicates. Older history expires under the retention policy.",
  ],
] as const;
export default function Home() {
  return (
    <Enter className="home landing immersive-landing">
      <section className="landing-hero">
        <div className="landing-copy">
          <div className="launch-tag">
            <span /> ONE LEDGER FOR ARC USDC
          </div>
          <h1>
            Every USDC movement on Arc.
            <br />
            <ScrambleHeadline />
          </h1>
          <p className="landing-description">
            Arc shows the same USDC balance in two formats. Most tools count
            both, so activity looks twice as big as it is. ArcLedger merges them
            into one clean, exact ledger.
          </p>
          <div className="landing-actions">
            <MagneticLink href="/explorer">View Live Demo</MagneticLink>
            <MagneticLink href={repo} secondary>
              Star on GitHub
            </MagneticLink>
          </div>
          <p className="hero-assurance">
            Open source · MIT licensed · No API keys · No accounts
          </p>
        </div>
        <SignatureMerge />
      </section>
      <div className="landing-search">
        <div>
          <span className="eyebrow">FOLLOW A TRANSACTION</span>
          <p>Go straight to the evidence.</p>
        </div>
        <SearchBar />
      </div>
      <section className="landing-section problem-section" id="problem">
        <Reveal className="section-intro">
          <span className="eyebrow">01 / THE PROBLEM</span>
          <h2>
            Arc USDC has two faces.
            <br />
            <span>That breaks your numbers.</span>
          </h2>
          <p>The same USDC balance on Arc can be read two ways:</p>
        </Reveal>
        <div className="representation-pair">
          <div>
            <span>Native</span>
            <strong>
              18 <small>decimals</small>
            </strong>
            <code>10.000000000000000000</code>
          </div>
          <span className="representation-equals">=</span>
          <div>
            <span>ERC-20</span>
            <strong>
              6 <small>decimals</small>
            </strong>
            <code>10.000000</code>
          </div>
        </div>
        <ScrollWords text="Both fire their own transfer events. Add them together and one payment looks like two. Volumes double, balances drift, and reports stop matching reality." />
      </section>
      <section className="landing-section fix-section" id="the-fix">
        <Reveal className="section-intro">
          <span className="eyebrow">02 / THE FIX</span>
          <h2>
            One payment.
            <br />
            <span>One entry.</span>
          </h2>
          <p>
            ArcLedger keeps the original evidence and matches the native and
            ERC-20 records one-to-one. Each movement is counted once, and gas
            fees are tracked separately from the receipt.
          </p>
          <p>The result is a ledger you can trust and explain.</p>
          <span className="small-note">
            Evidence is preserved within the current retained history window.
          </span>
        </Reveal>
        <NormalizationDemo />
      </section>
      <section className="landing-section" id="how-it-works">
        <Reveal className="section-intro">
          <span className="eyebrow">03 / HOW IT WORKS</span>
          <h2>
            From raw events.
            <br />
            <span>To a ledger that adds up.</span>
          </h2>
        </Reveal>
        <Steps />
      </section>
      <section className="landing-section" id="features">
        <Reveal className="section-intro">
          <span className="eyebrow">04 / PRECISE BY DESIGN</span>
          <h2>
            The details make
            <br />
            <span>the difference.</span>
          </h2>
        </Reveal>
        <div className="feature-bento">
          {features.map(([Icon, title, body], i) => (
            <Reveal className={`glass bento-card bento-${i}`} key={title}>
              <span className="bento-beam" aria-hidden="true" />
              <div className="bento-icon">
                <Icon size={20} />
                <span>0{i + 1}</span>
              </div>
              <h3>{title}</h3>
              <p>{body}</p>
            </Reveal>
          ))}
        </div>
      </section>
      <section className="landing-section" id="api">
        <Reveal className="section-intro">
          <span className="eyebrow">05 / EXPLORER + API</span>
          <h2>
            Simple to read.
            <br />
            <span>Simple to build on.</span>
          </h2>
          <p>
            Four public endpoints, no signup. Exact values, clear evidence and
            cursor pagination.
          </p>
        </Reveal>
        <ApiPreview />
        <p className="small-note">
          Address summaries cover retained history. Current balances come from
          eth_getBalance on Arc.
        </p>
      </section>
      <section className="landing-section audience-section">
        <Reveal className="section-intro">
          <span className="eyebrow">06 / WHO IT’S FOR</span>
          <h2>
            For the people who
            <br />
            <span>need the numbers right.</span>
          </h2>
        </Reveal>
        <div className="audience-grid">
          {[
            ["Finance & accounting teams", "Books that match the chain."],
            ["Wallets & dashboards", "Correct balances and history."],
            [
              "Analysts & researchers",
              "Real USDC volume, not inflated volume.",
            ],
            [
              "Developers",
              "A clean API instead of custom event-matching code.",
            ],
          ].map(([a, b]) => (
            <article key={a}>
              <h3>{a}</h3>
              <p>{b}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="landing-section getting-started" id="get-started">
        <Reveal className="section-intro">
          <span className="eyebrow">07 / GET STARTED IN MINUTES</span>
          <h2>
            Try it now.
            <br />
            <span>No database needed.</span>
          </h2>
          <p>
            Open <code>http://127.0.0.1:3000</code>. Without a <code>.env</code>
            , it runs on clearly labeled demo data. Add your Arc RPC and
            Supabase details to go live on Mainnet.
          </p>
          <p>
            Ready for production? Deploy to Railway with the included runbook.
          </p>
          <a className="text-link" href={`${repo}/blob/master/docs/railway.md`}>
            Read the Railway guide <ArrowUpRight size={15} />
          </a>
        </Reveal>
        <div className="install-terminal">
          <div className="terminal-top">
            <span>
              <i />
              <i />
              <i /> Your terminal
            </span>
            <CopyCode value={"npm ci\nnpm run dev"} label="Copy commands" />
          </div>
          <pre>
            <span>$</span> npm ci{"\n"}
            <span>$</span> npm run dev
          </pre>
          <div className="terminal-output">
            <Check size={14} /> Ready on localhost:3000
            <small>Clone the repository first · Node.js 22.16+</small>
          </div>
        </div>
      </section>
      <section className="landing-section honest-section" id="honest">
        <Reveal className="section-intro">
          <span className="eyebrow">08 / HONEST BY DESIGN</span>
          <h2>
            We tell you exactly
            <br />
            <span>what’s proven.</span>
          </h2>
        </Reveal>
        <div className="honest-claims">
          {[
            "Validation shows its exact block range and completion time.",
            "“Zero mismatches” means no failed checks in that sample. It is not a lifetime audit.",
            "Demo data is always labeled and never replaces a failed Mainnet connection.",
            "Validator rewards and other non-event balance changes are out of scope.",
            "This demo uses a 400 MB rolling database budget. Older complete histories expire; the explorer shows the retained coverage.",
          ].map((t) => (
            <div key={t}>
              <Check size={17} />
              <ScrollWords text={t} />
            </div>
          ))}
        </div>
      </section>
      <section className="landing-section faq-section">
        <Reveal className="section-intro">
          <span className="eyebrow">09 / A FEW ANSWERS</span>
          <h2>Clear by design.</h2>
        </Reveal>
        <FAQ />
      </section>
      <section className="landing-final magnetic-banner">
        <Reveal>
          <span className="eyebrow">ARCLEDGER</span>
          <h2>
            Stop guessing.
            <br />
            <span>Start reconciling.</span>
          </h2>
          <p>The accounting layer Arc USDC has been missing.</p>
          <div className="landing-actions">
            <MagneticLink href="/explorer">View Live Demo</MagneticLink>
            <Link href={`${repo}#readme`} className="text-link">
              Read the Docs <ArrowUpRight size={15} />
            </Link>
          </div>
        </Reveal>
      </section>
    </Enter>
  );
}
