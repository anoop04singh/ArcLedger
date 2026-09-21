import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Layers3,
  ReceiptText,
  ScanLine,
  Building2,
  Code2,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import { SearchBar } from "@/components/search";
import { Enter, Reveal } from "@/components/motion";
import { NormalizationDemo } from "@/components/normalization-demo";
export default function Home() {
  return (
    <Enter className="home landing">
      <section className="landing-hero">
        <div className="landing-copy">
          <div className="launch-tag">
            <span /> BUILT FOR ARC. PRECISE BY DESIGN.
          </div>
          <h1>
            One movement.
            <br />
            <span>Counted once.</span>
          </h1>
          <p className="landing-lead">The accounting layer for Arc USDC.</p>
          <p className="landing-description">
            Native transfers. ERC-20 activity. Network fees.
            <br />
            One clear ledger of what actually moved.
          </p>
          <div className="landing-actions">
            <Link className="solid-link" href="/explorer">
              Open explorer <ArrowUpRight size={17} />
            </Link>
            <a className="outline-link" href="#how-it-works">
              See how it works <ArrowRight size={16} />
            </a>
          </div>
          <div className="hero-assurance">
            <ShieldCheck size={15} /> Read-only by design <span /> No wallet
            connection
          </div>
        </div>
        <NormalizationDemo />
      </section>
      <div className="landing-search">
        <div>
          <span className="eyebrow">ALREADY HAVE A TRANSACTION?</span>
          <p>Go straight to the evidence.</p>
        </div>
        <SearchBar />
      </div>
      <Reveal className="principle-strip">
        <div>
          <strong>18 → 6</strong>
          <span>Decimal representations, reconciled</span>
        </div>
        <div>
          <strong>1 : 1</strong>
          <span>Evidence matching, without double counting</span>
        </div>
        <div>
          <strong>USDC</strong>
          <span>Transfers and gas, in the same currency</span>
        </div>
      </Reveal>
      <section id="how-it-works" className="landing-section">
        <Reveal className="section-intro">
          <span className="eyebrow">01 / LESS NOISE. MORE SIGNAL.</span>
          <h2>
            Events tell you what happened.
            <br />
            <span>ArcLedger tells you what moved.</span>
          </h2>
          <p>
            Arc's native USDC and ERC-20 interface represent the same balance. A
            single transfer can appear in both event streams. Adding them
            together gets the accounting wrong.
          </p>
        </Reveal>
        <div className="feature-grid">
          {[
            {
              Icon: Layers3,
              title: "Reconcile the representations.",
              text: "Match native and ERC-20 records by transaction, participants and exact amount. Keep repeated transfers separate.",
              tag: "ONE MOVEMENT, COUNTED ONCE",
              color: "violet",
            },
            {
              Icon: ReceiptText,
              title: "Make the math explicit.",
              text: "Preserve native precision. Separate the transfer from the gas fee. Show the sender’s gross and net change.",
              tag: "INTEGER PRECISION, END TO END",
              color: "mint",
            },
            {
              Icon: ScanLine,
              title: "Keep the receipts.",
              text: "Trace every canonical record back to its raw logs. Inspect how it was matched, and what was excluded.",
              tag: "EXPLAINABLE BY DEFAULT",
              color: "orange",
            },
          ].map(({ Icon, title, text, tag, color }, i) => (
            <Reveal key={title} className={`glass feature-card ${color}`}>
              <div className="feature-top">
                <span className="feature-icon">
                  <Icon size={23} strokeWidth={1.5} />
                </span>
                <span>0{i + 1}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
              <span className="feature-tag">{tag}</span>
            </Reveal>
          ))}
        </div>
      </section>
      <Reveal className="accounting-section">
        <div>
          <span className="eyebrow">02 / THE WHOLE ECONOMIC PICTURE</span>
          <h2>
            A transfer is only
            <br />
            part of the story.
          </h2>
          <p>
            On Arc, gas is USDC too. ArcLedger gives every fee a place in the
            ledger, without confusing it with the transfer amount.
          </p>
          <Link className="text-link" href="/explorer">
            Inspect a transaction <ArrowUpRight size={15} />
          </Link>
        </div>
        <div className="accounting-example glass">
          <div className="between">
            <span className="eyebrow">SENDER'S LEDGER</span>
            <span className="example-tag">Illustration</span>
          </div>
          <div>
            <span>Transfer to recipient</span>
            <strong>
              −10.000000 <small>USDC</small>
            </strong>
          </div>
          <div>
            <span>Network fee</span>
            <strong>
              −0.000031 <small>USDC</small>
            </strong>
          </div>
          <div className="net-example">
            <span>Net change</span>
            <strong>
              −10.000031 <small>USDC</small>
            </strong>
          </div>
          <p>
            <Check size={13} /> Recipient receives 10.000000 USDC.
          </p>
        </div>
      </Reveal>
      <section className="landing-section">
        <Reveal className="section-intro">
          <span className="eyebrow">
            03 / BUILT FOR THE PEOPLE BEHIND THE PAYMENTS
          </span>
          <h2>
            From raw activity
            <br />
            to useful accounting.
          </h2>
        </Reveal>
        <div className="usecase-grid">
          {[
            {
              Icon: Building2,
              title: "Finance & treasury",
              text: "Understand receipts, outgoing transfers and fees. Read an address ledger with explicit net changes.",
            },
            {
              Icon: Code2,
              title: "Product developers",
              text: "Build on four focused read APIs. Get consistent USDC amounts without rebuilding event matching.",
            },
            {
              Icon: Wallet,
              title: "Payment operations",
              text: "Investigate a transaction, follow its participants and explain the underlying protocol evidence.",
            },
          ].map(({ Icon, title, text }) => (
            <Reveal key={title} className="usecase">
              <Icon size={23} strokeWidth={1.5} />
              <h3>{title}</h3>
              <p>{text}</p>
            </Reveal>
          ))}
        </div>
      </section>
      <Reveal className="verification-band">
        <div>
          <span className="eyebrow">TRUST THE EVIDENCE, NOT A BADGE.</span>
          <h2>Accounting you can inspect.</h2>
          <p>
            Real validation runs. Explicit block ranges. Visible mismatches.
            <br />
            No hidden gaps, and no claims beyond the sample checked.
          </p>
        </div>
        <Link className="outline-link" href="/validation">
          View validation <ArrowUpRight size={16} />
        </Link>
      </Reveal>
      <Reveal className="landing-bottom">
        <span className="eyebrow">ARCLEDGER</span>
        <h2>
          Follow a transaction.
          <br />
          <span>Find the clarity.</span>
        </h2>
        <Link className="solid-link" href="/explorer">
          Explore the ledger <ArrowRight size={17} />
        </Link>
        <p>No account. No wallet. Just the ledger.</p>
      </Reveal>
    </Enter>
  );
}
