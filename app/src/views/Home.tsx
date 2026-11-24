import { fmtAda, short } from "@wd/shared/wd";
import { assetLabel, type Found } from "@wd/shared/rescue";
import type { Ctx } from "../ctx.ts";
import { IpfsImg, Stat } from "../ui.tsx";

export function Home({ c, go, stuck = [] }: { c: Ctx; go: (tab: string) => void; stuck?: Found[] }) {
  const { account: a, session } = c;
  const face = a.skulls[0];
  return (
    <div>
      <section className="card hero">
        {face ? <IpfsImg className="face" image={face.image} alt={face.name} /> : <div className="face img-missing">☠</div>}
        <div>
          <div className="who">{a.label.startsWith("$") ? a.label : short(a.label, 12, 6)}</div>
          <div className={session?.verified ? "badge ok" : "badge"}>
            {session ? (session.verified ? "✓ signed in" : "connected — not verified") : "watching (read-only)"}
          </div>
          {face && <div className="small">{face.name}</div>}
        </div>
      </section>

      {stuck.length > 0 && (
        <button className="banner" onClick={() => go("rescue")}>
          <b>⛏ Rescue:</b> {stuck.map(assetLabel).filter(Boolean).slice(0, 3).join(", ")} stuck in {stuck.length} old contract{stuck.length > 1 ? "s" : ""} →
        </button>
      )}

      <div className="stats">
        <button className="stat-btn" onClick={() => go("skulls")}>
          <Stat label="Skulls" value={a.holdings.skulls.length} sub={stuck.some((f) => f.skulls.length) ? "incl. locked ones" : "Genesis collection"} />
        </button>
        <button className="stat-btn" onClick={() => go("work")}>
          <Stat label="$WORK" value={a.holdings.work.toLocaleString("en-GB")} sub="utility token" />
        </button>
        <Stat label="ADA" value={fmtAda(a.lovelace)} sub={`${a.holdings.otherAssets} other tokens`} />
      </div>

      {c.net === "Mainnet" && a.holdings.skulls.length === 0 && (
        <section className="card">
          <p>No Working Dead skulls in this wallet yet. Use <b>Lookup</b> to browse the collection.</p>
        </section>
      )}
      {c.net !== "Mainnet" && (
        <section className="card">
          <p>You're on <b>{c.net}</b>. The skulls and $WORK live on Mainnet. The new contracts live here until they're reviewed: see <b>More → New contracts</b>.</p>
        </section>
      )}
    </div>
  );
}
