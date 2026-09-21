import { getExplorer } from "@/lib/api";
import { LiveExplorer } from "@/components/live-explorer";
import { SearchBar } from "@/components/search";
import { Enter } from "@/components/motion";
export const dynamic = "force-dynamic";
export const metadata = { title: "Explorer" };
export default async function Explorer() {
  const data = await getExplorer().catch(() => null);
  return (
    <Enter className="explorer-page">
      <div className="explorer-intro">
        <div>
          <span className="eyebrow">ARC MAINNET / USDC</span>
          <h1>
            Follow the money.
            <br />
            <span>Understand the movement.</span>
          </h1>
          <p>
            Live network context. An auditable trail. Every USDC counted once.
          </p>
        </div>
        <span className="explorer-symbol" aria-hidden="true">
          ↗
        </span>
      </div>
      <SearchBar />
      <LiveExplorer initial={data} />
    </Enter>
  );
}
