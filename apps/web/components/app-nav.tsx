"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
export function AppNav() {
  const path = usePathname();
  const explorer =
    path.startsWith("/explorer") ||
    path.startsWith("/tx/") ||
    path.startsWith("/address/");
  return (
    <nav aria-label="Main navigation">
      <Link href="/explorer" aria-current={explorer ? "page" : undefined}>
        Explorer
      </Link>
      <Link
        href="/status"
        aria-current={
          path === "/status" || path === "/validation" ? "page" : undefined
        }
      >
        Network status
      </Link>
      <a
        className="docs-link"
        href="https://github.com/anoop04singh/ArcLedger#readme"
        target="_blank"
        rel="noreferrer"
      >
        Docs <ArrowUpRight size={14} />
      </a>
    </nav>
  );
}
