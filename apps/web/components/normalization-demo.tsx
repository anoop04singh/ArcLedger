"use client";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowDown, Check, Layers3 } from "lucide-react";
const cases = [
  {
    label: "ERC-20 transfer",
    native: "10.000000000000000000",
    erc: "10.000000",
    result: "10.00",
    note: "Two representations. One transfer.",
  },
  {
    label: "Native transfer",
    native: "10.000000000000000000",
    erc: null,
    result: "10.00",
    note: "Native evidence. Full precision.",
  },
  {
    label: "Self transfer",
    native: null,
    erc: "10.000000",
    result: "0.00",
    note: "One audit record. Zero transfer balance change.",
  },
];
export function NormalizationDemo() {
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion();
  const c = cases[active];
  return (
    <div className="proof-panel glass">
      <div className="proof-top">
        <span className="eyebrow">THE ARCLEDGER DIFFERENCE</span>
        <Layers3 size={18} />
      </div>
      <div
        className="proof-tabs"
        role="group"
        aria-label="Normalization example"
      >
        {cases.map((x, i) => (
          <button
            key={x.label}
            onClick={() => setActive(i)}
            aria-pressed={active === i}
          >
            {active === i && (
              <motion.span
                layoutId="example-tab"
                className="tab-fill"
                transition={{ duration: reduce ? 0 : 0.25 }}
              />
            )}
            <span>{x.label}</span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={active}
          initial={{ opacity: 0, y: reduce ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : -6 }}
          transition={{ duration: 0.18 }}
          className="proof-records"
        >
          <span className="eyebrow">RAW PROTOCOL RECORDS</span>
          {c.native && (
            <div className="proof-record">
              <span>
                <i className="record-dot violet" />
                Native · EIP-7708
              </span>
              <strong className="mono">{c.native}</strong>
              <small>18 decimals · canonical evidence</small>
            </div>
          )}
          {c.erc && (
            <div className="proof-record">
              <span>
                <i className="record-dot orange" />
                ERC-20 Transfer
              </span>
              <strong className="mono">{c.erc}</strong>
              <small>
                {c.native
                  ? "6 decimals · matched representation"
                  : "6 decimals · self-transfer record"}
              </small>
            </div>
          )}
          {!c.native && (
            <p className="proof-note">
              Arc emits no native system event for a self transfer.
            </p>
          )}
          <div className="proof-flow">
            <motion.span
              animate={
                reduce ? {} : { y: [-5, 5, -5], opacity: [0.35, 1, 0.35] }
              }
              transition={{ repeat: Infinity, duration: 3 }}
            >
              <ArrowDown size={20} />
            </motion.span>
          </div>
          <div className="proof-result">
            <span className="eyebrow">
              {active === 2
                ? "TRANSFER BALANCE CHANGE"
                : "ACTUAL ECONOMIC MOVEMENT"}
            </span>
            <strong>
              {c.result}
              <small> USDC</small>
            </strong>
            <span>
              <Check size={14} />
              {c.note}
            </span>
          </div>
        </motion.div>
      </AnimatePresence>
      <p className="proof-disclaimer">
        Interactive illustration · network fee accounted for separately.
      </p>
    </div>
  );
}
