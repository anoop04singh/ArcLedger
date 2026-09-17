"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Search } from "lucide-react";
import { Button } from "./ui/button";
export function SearchBar() {
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  return (
    <div className="search-wrap">
      <form
        className="search-bar glass"
        onSubmit={(event) => {
          event.preventDefault();
          const value = query.trim();
          if (/^0x[\da-fA-F]{40}$/.test(value))
            router.push(`/address/${value}`);
          else if (/^0x[\da-fA-F]{64}$/.test(value))
            router.push(`/tx/${value}`);
          else
            setError(
              "Enter a valid 0x address (40 characters) or transaction hash (64 characters).",
            );
        }}
      >
        <Search size={21} aria-hidden="true" />
        <input
          aria-label="Search address or transaction hash"
          aria-describedby={error ? "search-error" : undefined}
          aria-invalid={!!error}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setError("");
          }}
          placeholder="Search address or transaction hash"
          spellCheck={false}
        />
        <Button size="icon" aria-label="Search ledger">
          <ArrowRight size={19} />
        </Button>
      </form>
      {error && (
        <p id="search-error" role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
