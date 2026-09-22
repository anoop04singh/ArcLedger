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
            Every transfer.
            <br />
            <span>One clear record.</span>
          </h1>
          <p>
            Search an address or transaction. See what moved, who paid the fee,
            and the evidence behind it.
          </p>
        </div>
      </div>
      <SearchBar />
      <LiveExplorer initial={data} />
    </Enter>
  );
}
