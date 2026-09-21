import Link from "next/link";
import { ArrowDown, ArrowUp, Check, ChevronRight } from "lucide-react";
import { short } from "@/lib/format";
export function AddressEntryRow({
  entry,
}: {
  entry: import("@arcledger/types").PublicLedger["entries"][number];
}) {
  const incoming = entry.direction === "incoming";
  return (
    <Link className="transaction-row" href={`/tx/${entry.txHash}`}>
      <span className={`direction ${incoming ? "incoming" : ""}`}>
        {incoming ? <ArrowDown size={19} /> : <ArrowUp size={19} />}
      </span>
      <div className="row-description">
        <strong>
          {entry.type === "self"
            ? "Self transfer"
            : entry.type === "network_fee"
              ? "Network fee"
              : incoming
                ? "Received"
                : "Sent"}
        </strong>
        <span className="mono">
          {entry.counterparty
            ? incoming
              ? `${short(entry.counterparty)} → You`
              : `You → ${short(entry.counterparty)}`
            : short(entry.txHash)}
        </span>
        <time className="entry-time" dateTime={entry.timestamp}>
          {new Date(entry.timestamp).toLocaleString("en-GB", {
            timeZone: "UTC",
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          UTC
        </time>
      </div>
      <div className="row-amount">
        <strong>
          {entry.type === "network_fee" ? entry.fee : entry.amount}{" "}
          <span>USDC</span>
        </strong>
        <span>
          {entry.fee !== "0" ? `Fee ${entry.fee} USDC · ` : ""}Net{" "}
          {entry.netChange} USDC
        </span>
      </div>
      <div className="row-status">
        <span>
          <Check size={13} /> Final
        </span>
        <small>
          {entry.status === "reverted"
            ? "Reverted"
            : `Block ${Number(entry.blockNumber).toLocaleString("en-US")}`}
        </small>
      </div>
      <ChevronRight size={16} className="muted" />
    </Link>
  );
}
