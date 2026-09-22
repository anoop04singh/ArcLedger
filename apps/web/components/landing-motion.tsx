"use client";
import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { ArrowUpRight, Check, Copy, Plus, Minus } from "lucide-react";

export function ScrollHeader({ children }: { children: React.ReactNode }) {
  const { scrollY, scrollYProgress } = useScroll();
  const [hidden, setHidden] = useState(false);
  const reduce = useReducedMotion();
  useMotionValueEvent(scrollY, "change", (v) =>
    setHidden(v > 160 && v > (scrollY.getPrevious() ?? 0)),
  );
  return (
    <motion.header
      className="header scroll-header"
      animate={{ y: hidden && !reduce ? "-110%" : "0%" }}
      transition={{ duration: 0.22 }}
      onFocusCapture={() => setHidden(false)}
    >
      {children}
      <motion.div
        className="reading-progress"
        style={{ scaleX: scrollYProgress }}
        aria-hidden="true"
      />
    </motion.header>
  );
}
export function MagneticLink({
  href,
  children,
  secondary = false,
}: {
  href: string;
  children: React.ReactNode;
  secondary?: boolean;
}) {
  const x = useMotionValue(0),
    y = useMotionValue(0),
    sx = useSpring(x, { stiffness: 250, damping: 20 }),
    sy = useSpring(y, { stiffness: 250, damping: 20 });
  const reduce = useReducedMotion();
  return (
    <motion.a
      href={href}
      className={
        secondary ? "outline-link rolling-link" : "solid-link rolling-link"
      }
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        if (reduce || e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * 0.1);
        y.set((e.clientY - r.top - r.height / 2) * 0.1);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      <span className="rolling-label">
        <span>{children}</span>
        <span aria-hidden="true">{children}</span>
      </span>
      <ArrowUpRight size={16} />
    </motion.a>
  );
}
export function ScrambleHeadline() {
  const text = "Counted once.";
  const [visible, setVisible] = useState(text);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    let n = 0;
    const id = setInterval(() => {
      n++;
      setVisible(
        [...text]
          .map((c, i) =>
            i < n / 2 ? c : c === " " ? " " : String((i + n) % 10),
          )
          .join(""),
      );
      if (n >= text.length * 2) clearInterval(id);
    }, 35);
    return () => clearInterval(id);
  }, [reduce]);
  return (
    <span className="scramble-headline" aria-label={text}>
      <span aria-hidden="true">{visible}</span>
    </span>
  );
}
export function SignatureMerge() {
  const ref = useRef<HTMLDivElement>(null),
    prefersReducedMotion = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Server and first browser render must agree before applying media preferences.
  const reduce = mounted && prefersReducedMotion;
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 75%", "end 30%"],
  });
  const progress = useTransform(scrollYProgress, [0, 0.85], [0, 1]);
  const fade = useTransform(progress, [0, 0.65], [1, 0.25]);
  const amount = useTransform(progress, [0, 1], [2, 1]);
  const [counter, setCounter] = useState("2.00");
  useMotionValueEvent(amount, "change", (v) => setCounter(v.toFixed(2)));
  return (
    <div ref={ref} className="signature-scene glass">
      <div className="signature-top">
        <span className="eyebrow">TWO REPRESENTATIONS. ONE MOVEMENT.</span>
        <span className="signature-counter">
          {reduce ? "1.00" : counter}
          <small>×</small>
        </span>
      </div>
      <div className="stream-labels">
        <span>
          Native <small>18 decimals</small>
        </span>
        <span>
          ERC-20 <small>6 decimals</small>
        </span>
      </div>
      <svg
        viewBox="0 0 480 300"
        role="img"
        aria-label="Two protocol streams merge into one canonical USDC ledger"
      >
        <defs>
          <linearGradient id="stream-color" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="#a29bbe" />
            <stop offset="1" stopColor="#729b8c" />
          </linearGradient>
        </defs>
        {[-60, -30, 0, 30, 60].map((o, i) => (
          <g key={o}>
            <path
              d={`M ${115 + o} 0 C ${115 + o} 155 240 130 240 230 L 240 295`}
              fill="none"
              stroke="#e0e8e4"
            />
            <path
              d={`M ${365 + o} 0 C ${365 + o} 155 240 130 240 230 L 240 295`}
              fill="none"
              stroke="#e7e4ed"
            />
            <motion.path
              d={`M ${115 + o} 0 C ${115 + o} 155 240 130 240 230 L 240 295`}
              fill="none"
              stroke="url(#stream-color)"
              strokeWidth="2"
              style={{ pathLength: reduce ? 1 : progress }}
            />
            <motion.path
              d={`M ${365 + o} 0 C ${365 + o} 155 240 130 240 230 L 240 295`}
              fill="none"
              stroke="url(#stream-color)"
              strokeWidth="2"
              style={{ pathLength: reduce ? 1 : progress }}
            />
            {!reduce && (
              <motion.circle
                r="3"
                fill={i % 2 ? "#a29bbe" : "#729b8c"}
                animate={{
                  cx: [115 + o, 155 + o / 2, 240, 240],
                  cy: [0, 110, 230, 295],
                  opacity: [0, 0.8, 1, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  delay: i * 0.5,
                  ease: "linear",
                }}
              />
            )}
          </g>
        ))}
        <motion.text
          x="60"
          y="56"
          className="stream-digits"
          style={{ opacity: reduce ? 0.3 : fade }}
        >
          10.000000000000000000
        </motion.text>
        <motion.text
          x="295"
          y="86"
          className="stream-digits"
          style={{ opacity: reduce ? 0.3 : fade }}
        >
          10.000000
        </motion.text>
      </svg>
      <div className="signature-result">
        <span className="eyebrow">CANONICAL ECONOMIC MOVEMENT</span>
        <strong>
          10.00 <small>USDC</small>
        </strong>
        <span>
          <Check size={13} /> One payment. One entry.
        </span>
      </div>
      <p className="illustration-label">
        Illustration · scroll to reconcile · gas accounted separately
      </p>
    </div>
  );
}
function Word({
  children,
  progress,
  start,
  end,
}: {
  children: string;
  progress: ReturnType<typeof useScroll>["scrollYProgress"];
  start: number;
  end: number;
}) {
  const opacity = useTransform(progress, [start, end], [0.25, 1]);
  const reduce = useReducedMotion();
  return (
    <motion.span style={{ opacity: reduce ? 1 : opacity }}>
      {children}{" "}
    </motion.span>
  );
}
export function ScrollWords({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 90%", "end 45%"],
  });
  const words = text.split(" ");
  return (
    <p ref={ref} className="scroll-words" aria-label={text}>
      {words.map((w, i) => (
        <Word
          key={i}
          progress={scrollYProgress}
          start={i / words.length}
          end={(i + 1) / words.length}
        >
          {w}
        </Word>
      ))}
    </p>
  );
}
export function Steps() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollXProgress } = useScroll({ container: ref, axis: "x" });
  const reduce = useReducedMotion();
  return (
    <div className="steps-shell">
      <div
        className="steps-track"
        ref={ref}
        tabIndex={0}
        aria-label="How it works. Scroll horizontally on smaller screens."
      >
        {[
          [
            "01",
            "Index",
            "Reads raw blocks, transactions, receipts and logs from Arc Mainnet. Original evidence stays intact within the retained history window.",
          ],
          [
            "02",
            "Normalize",
            "Pairs the native and ERC-20 records, counts each movement once, and books gas fees on their own line.",
          ],
          [
            "03",
            "Serve",
            "Exposes the clean ledger through a simple API and an explorer UI.",
          ],
        ].map(([n, title, body]) => (
          <article key={n} className="step-card">
            <span>{n}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <svg
        className="steps-path"
        viewBox="0 0 1000 10"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M0 5 H1000" stroke="#e3e8e4" strokeWidth="2" />
        <motion.path
          d="M0 5 H1000"
          stroke="#6d8c7d"
          strokeWidth="2"
          style={{ pathLength: reduce ? 1 : scrollXProgress }}
        />
      </svg>
    </div>
  );
}
export function CopyCode({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [state, setState] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <button
      className="code-copy"
      aria-label={state || label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("Copied");
        } catch {
          setState("Copy unavailable");
        }
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setState(""), 2000);
      }}
    >
      {state === "Copied" ? <Check size={15} /> : <Copy size={15} />}
      <span aria-live="polite">{state || label}</span>
    </button>
  );
}
export function ApiPreview() {
  const [active, setActive] = useState(0);
  const items = [
    ["/v1/status", "Health, chain head, lag, coverage, validation"],
    [
      "/v1/address/:address",
      "Live balance plus retained received, sent and fees",
    ],
    ["/v1/address/:address/ledger", "Cursor-paginated ledger entries"],
    ["/v1/tx/:txHash", "Movements, fee and matching evidence"],
  ];
  const examples = [
    { network: "arc-mainnet", status: "healthy", lag: 1 },
    { balance: "176.229835", received: "421.900000", feesPaid: "0.000031" },
    {
      currency: "USDC",
      entries: [{ direction: "incoming", amount: "25.000000", fee: "0" }],
    },
    {
      summary: { amount: "10.000000", fee: "0.000031", currency: "USDC" },
      normalization: {
        canonicalSource: "eip7708",
        duplicateRepresentationsRemoved: 1,
      },
    },
  ];
  const reduce = useReducedMotion();
  return (
    <div className="api-playground">
      <div className="api-endpoints" role="group" aria-label="API examples">
        {items.map(([url, desc], i) => (
          <button
            key={url}
            aria-pressed={active === i}
            onClick={() => setActive(i)}
          >
            <code>
              <b>GET</b> {url}
            </code>
            <span>{desc}</span>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </div>
      <div className="api-json glass">
        <div className="terminal-top">
          <span>
            <i />
            <i />
            <i /> Example response
          </span>
          <CopyCode value={`GET ${items[active][0]}`} label="Copy endpoint" />
        </div>
        <AnimatePresence mode="wait">
          <motion.pre
            key={active}
            initial={{
              opacity: 0,
              clipPath: reduce ? "none" : "inset(0 0 100% 0)",
            }}
            animate={{ opacity: 1, clipPath: "inset(0 0 0% 0)" }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.35 }}
          >
            {JSON.stringify(examples[active], null, 2)}
          </motion.pre>
        </AnimatePresence>
        <small>Illustrative response · live data is in the explorer</small>
      </div>
    </div>
  );
}
export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();
  const items = [
    [
      "Why does Arc USDC get double-counted?",
      "It has two representations, native (18 decimals) and ERC-20 (6 decimals), and each emits its own transfer event. ArcLedger pairs matching records so each payment counts once.",
    ],
    [
      "Do I need an API key or an account?",
      "No. Public reads are open and rate-limited.",
    ],
    [
      "Is this a hosted service?",
      "ArcLedger is open source and self-hostable, locally or on Railway. This website is a live demonstration of that deployment, not a managed service with a paid SLA.",
    ],
    [
      "How much history does the live demo keep?",
      "This deployment uses a 400 MB database budget. It removes the oldest complete block histories as it fills up. Totals and audit evidence cover the retained window; current balances always come directly from Arc.",
    ],
    [
      "Do I need a smart contract?",
      "No. ArcLedger reads the chain; it does not require deploying a contract.",
    ],
    [
      "What’s not included yet?",
      "Authentication, billing, multichain support, tax reporting and analytics.",
    ],
  ];
  return (
    <div className="faq-list">
      {items.map(([q, a], i) => (
        <div className="faq-item" key={q}>
          <h3>
            <button
              aria-expanded={open === i}
              aria-controls={`faq-${i}`}
              id={`faq-button-${i}`}
              onClick={() => setOpen(open === i ? null : i)}
            >
              {q}
              {open === i ? <Minus size={18} /> : <Plus size={18} />}
            </button>
          </h3>
          <AnimatePresence initial={false}>
            {open === i && (
              <motion.div
                id={`faq-${i}`}
                role="region"
                aria-labelledby={`faq-button-${i}`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={
                  reduce
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 220, damping: 28 }
                }
              >
                <p>{a}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}
