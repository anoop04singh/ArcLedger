import type { LedgerStatus } from "@arcledger/types";
export function RetentionNotice({
  retention,
  startBlock,
}: {
  retention?: LedgerStatus["retention"];
  startBlock: string | null;
}) {
  if (!retention) return null;
  return (
    <>
      <RetentionWarning retention={retention} />
      <details className="retention-notice">
        <summary>
          <strong>Recent history</strong>
          <span>
            {(retention.databaseBytes / 1_000_000).toFixed(1)} /{" "}
            {retention.capBytes / 1_000_000} MB
          </span>
          <span className="retention-hint">Coverage & storage</span>
        </summary>
        <p>
          Retained coverage begins at block {startBlock ?? "—"}. Older blocks,
          receipts, logs and ledger entries expire together; summaries cover
          this window, not lifetime activity. Current balances are read directly
          from Arc.
          {retention.prunedBlocks > 0 && (
            <>
              {" "}
              {retention.prunedBlocks.toLocaleString("en-US")} older blocks
              removed.
            </>
          )}
        </p>
      </details>
    </>
  );
}

export function RetentionWarning({
  retention,
}: {
  retention?: LedgerStatus["retention"];
}) {
  return retention && retention.state !== "ready" ? (
    <p className="feed-error" role="status">
      <strong>
        {retention.state === "blocked"
          ? "Storage protection is pausing ingestion until space can be reclaimed."
          : "Storage maintenance is reclaiming space."}
      </strong>
    </p>
  ) : null;
}
