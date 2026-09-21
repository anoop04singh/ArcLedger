import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist-mono/400.css";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "ArcLedger — One dollar. One ledger.",
    template: "%s · ArcLedger",
  },
  description:
    "The accounting layer for Arc USDC. Normalize native transfers, ERC-20 activity and gas into one canonical ledger.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="ambient" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="header">
          <Link href="/" className="brand" aria-label="ArcLedger home">
            <span className="brand-mark">
              a<span />
            </span>
            ArcLedger
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/">Explorer</Link>
            <Link href="/status">Network status</Link>
            <Link href="/validation">Validation</Link>
            <a
              className="docs-link"
              href="https://docs.arc.io/arc/references/usdc-system-events"
              target="_blank"
              rel="noreferrer"
            >
              Arc docs <ArrowUpRight size={14} />
            </a>
          </nav>
          <span className="network-label">
            <span />
            Arc Mainnet
          </span>
        </header>
        <main id="main">{children}</main>
        <footer>
          <Link href="/" className="footer-brand">
            ArcLedger <span>One dollar. One ledger.</span>
          </Link>
          <span>Built for Arc. Precise by design.</span>
          <Link href="/status">
            System status <span className="status-ring" />
          </Link>
        </footer>
      </body>
    </html>
  );
}
