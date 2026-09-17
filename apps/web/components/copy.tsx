"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
export function CopyButton({ value }: { value: string }) {
  const [state, setState] = useState("");
  return (
    <button
      className="copy"
      aria-label={state || "Copy address or hash"}
      title={state || "Copy"}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setState("Copied");
        } catch {
          setState("Copy unavailable");
        }
        setTimeout(() => setState(""), 2000);
      }}
    >
      {state === "Copied" ? <Check size={15} /> : <Copy size={15} />}
      <span className="sr-only" aria-live="polite">
        {state}
      </span>
    </button>
  );
}
