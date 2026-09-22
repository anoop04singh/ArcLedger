"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Layers3 } from "lucide-react";

export function LedgerStage() {
  const reduced = useReducedMotion();
  return (
    <figure className="ledger-stage" aria-label="Two protocol records become one economic movement">
      <div className="ledger-stage-grid">
        <div className="stage-column">
          <div className="stage-heading"><span>Raw events</span><small>Two representations</small></div>
          {[
            ["Native · 18 decimals", "10.000000000000000000", "native"],
            ["ERC-20 · 6 decimals", "10.000000", "erc"],
          ].map(([label, value, kind], i) => (
            <motion.div className="stage-record" key={kind} initial={{ opacity: 0, y: reduced ? 0 : 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: .4, delay: reduced ? 0 : i * .15 }}>
              <span className={`stage-tag ${kind}`}>{label}</span>
              <strong>{value}<small> USDC</small></strong>
              <span className="stage-route">Alice <ArrowRight size={14} /> Bob</span>
            </motion.div>
          ))}
        </div>
        <div className="stage-bridge" aria-hidden="true"><span>1:1</span><ArrowRight size={20} /></div>
        <div className="stage-column">
          <div className="stage-heading"><span>ArcLedger</span><small>One economic movement</small></div>
          <motion.div className="stage-canonical" initial={{ opacity: 0, scale: reduced ? 1 : .97 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: .5, delay: reduced ? 0 : .3 }}>
            <span className="stage-tag canonical"><Check size={13} /> Counted once</span>
            <strong>10.000000 <small>USDC</small></strong>
            <span className="stage-route">Alice <ArrowRight size={14} /> Bob</span>
            <p><Layers3 size={15} /> Two records. Original evidence retained.</p>
          </motion.div>
        </div>
      </div>
      <div className="stage-totals"><div><span>Counted both ways</span><strong>20.00 <small>USDC</small></strong></div><span className="stage-ratio">2× → 1×</span><div><span>Counted by ArcLedger</span><strong>10.00 <small>USDC</small></strong></div></div>
      <figcaption>Illustrative sample · not live Mainnet output · gas accounted for separately</figcaption>
    </figure>
  );
}
