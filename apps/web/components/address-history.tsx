"use client";
import { useRef, useState } from "react";
import type { PublicLedger } from "@arcledger/types";
import { ReceiptText } from "lucide-react";
import { AddressEntryRow } from "./address-entry";
import { Button } from "./ui/button";
export function AddressHistory({ initial }: { initial: PublicLedger }) {
  const [entries, setEntries] = useState(initial.entries),
    [cursor, setCursor] = useState(initial.nextCursor),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const inFlight = useRef(false);
  async function more() {
    if (!cursor || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/ledger/${initial.address}?cursor=${encodeURIComponent(cursor)}&limit=20`,
        { signal: AbortSignal.timeout(25000) },
      );
      const page = await response.json();
      if (!response.ok)
        throw new Error(page.error ?? "Unable to load more history");
      if (page.address !== initial.address || page.mode !== initial.mode)
        throw new Error(
          "Ledger source changed. Refresh to start a new history view.",
        );
      setEntries((previous) => {
        const seen = new Set(previous.map((e) => e.id));
        return [
          ...previous,
          ...(page as PublicLedger).entries.filter((e) => !seen.has(e.id)),
        ];
      });
      setCursor(page.nextCursor);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load history. Try again.",
      );
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }
  return (
    <>
      <div className="transaction-list" aria-busy={loading}>
        {entries.length ? (
          entries.map((entry) => (
            <AddressEntryRow key={entry.id} entry={entry} />
          ))
        ) : (
          <div className="empty">
            <ReceiptText size={26} />
            <h2>No indexed transactions</h2>
            <p>This address has no activity in the current indexed range.</p>
          </div>
        )}
      </div>
      <div className="pagination">
        {cursor && (
          <Button onClick={more} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        )}
        <span className="metadata" role="status">
          {entries.length} ledger {entries.length === 1 ? "entry" : "entries"}{" "}
          shown{!cursor && entries.length ? " · End of indexed history" : ""}
        </span>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
