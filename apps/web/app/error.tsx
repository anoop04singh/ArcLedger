"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="detail">
      <section className="glass empty">
        <h1>Unable to load this page</h1>
        <p>Try again to reconnect to the ledger.</p>
        <Button onClick={reset}>Try again</Button>
      </section>
    </div>
  );
}
