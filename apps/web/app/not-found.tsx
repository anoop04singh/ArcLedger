import Link from "next/link";
export default function NotFound() {
  return (
    <div className="detail">
      <section className="glass empty">
        <h1>Page not found</h1>
        <p>Search an address or transaction to get started.</p>
        <Link href="/">Back to explorer →</Link>
      </section>
    </div>
  );
}
