export default function ExplorerLoading() {
  return (
    <div
      className="detail loading-explorer"
      aria-busy="true"
      aria-label="Loading explorer"
    >
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-search" />
      <div className="explorer-stats">
        {[0, 1, 2, 3].map((i) => (
          <div className="glass skeleton skeleton-stat" key={i} />
        ))}
      </div>
      <div className="glass skeleton-list">
        {[0, 1, 2, 3, 4].map((i) => (
          <div className="skeleton skeleton-row" key={i} />
        ))}
      </div>
      <span className="sr-only">Loading live ledger data</span>
    </div>
  );
}
