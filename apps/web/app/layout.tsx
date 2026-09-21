import { ScrollHeader } from "@/components/landing-motion";
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
        <ScrollHeader>
          <Link href="/" className="brand" aria-label="ArcLedger home">
            <span className="brand-mark">
              a<span />
            </span>
            ArcLedger
          </Link>
          <nav aria-label="Main navigation">
            <Link href="/explorer">Explorer</Link>
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
        </ScrollHeader>
        <main id="main">{children}</main>
        <footer className="site-footer">
          <Link href="/" className="footer-brand">
            ArcLedger <span>One ledger for Arc USDC.</span>
          </Link>
          <nav aria-label="Footer navigation">
            {[
              ["MIT License", "LICENSE"],
              ["GitHub", ""],
              ["Docs", "#readme"],
              ["Architecture", "docs/architecture.md"],
              ["API", "docs/api.md"],
              ["Railway Guide", "docs/railway.md"],
            ].map(([label, path]) => (
              <a
                key={label}
                href={
                  "https://github.com/anoop04singh/ArcLedger" +
                  (path.startsWith("#")
                    ? path
                    : path
                      ? "/blob/master/" + path
                      : "")
                }
              >
                {label}
              </a>
            ))}
          </nav>
        </footer>
      </body>
    </html>
  );
}
