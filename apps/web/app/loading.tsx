export default function Loading() {
  return (
    <div className="detail loading" role="status">
      <div className="glass skeleton" />
      <p>Reading the ledger…</p>
    </div>
  );
}
