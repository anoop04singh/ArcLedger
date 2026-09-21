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
    <aside className="retention-notice">
      <strong>
        Rolling history · {(retention.databaseBytes / 1_000_000).toFixed(1)} /{" "}
        {retention.capBytes / 1_000_000} MB
      </strong>
      <br />
      Retained coverage begins at block {startBlock ?? "—"}. Older blocks,
      receipts, logs and ledger entries expire together; summaries cover this
      window, not lifetime activity. Current balances are read directly from
      Arc.
      {retention.prunedBlocks > 0 && (
        <>
          {" "}
          {retention.prunedBlocks.toLocaleString("en-US")} older blocks removed.
        </>
      )}
      {retention.state !== "ready" && (
        <>
          <br />
          <strong>
            {retention.state === "blocked"
              ? "Storage protection is pausing ingestion until space can be reclaimed."
              : "Storage maintenance is reclaiming space."}
          </strong>
        </>
      )}
    </aside>
  );
}
