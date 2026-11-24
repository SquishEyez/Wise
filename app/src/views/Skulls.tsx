import { useState } from "react";
import { EXPLORER, short, type Skull } from "@wd/shared/wd";
import type { Ctx } from "../ctx.ts";
import { IpfsImg, Sheet } from "../ui.tsx";
import { SendForm } from "./Send.tsx";
import { Lookup } from "./Lookup.tsx";

export function Skulls({ c }: { c: Ctx }) {
  const [open, setOpen] = useState<Skull | null>(null);
  const skulls = c.account.skulls;
  return (
    <div>
      <Lookup c={c} />
      {!skulls.length && <section className="card"><p>No skulls in this wallet.</p></section>}
      <div className="grid">
        {skulls.map((s) => (
          <button key={s.unit} className="tile" onClick={() => setOpen(s)}>
            <IpfsImg image={s.image} alt={s.name} />
            <span>#{s.number ?? "?"}{s.number && c.locked.has(s.number) ? " 🔒" : ""}</span>
          </button>
        ))}
      </div>
      {open && <SkullSheet c={c} s={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function SkullSheet({ c, s, onClose, owner }: { c: Ctx; s: Skull; onClose: () => void; owner?: string | null }) {
  const mine = c.account.holdings.skulls.includes(s.unit);
  const locked = s.number !== null && c.locked.has(s.number);
  return (
    <Sheet title={s.name} onClose={onClose}>
      <IpfsImg className="big" image={s.image} alt={s.name} />
      {owner !== undefined && <p className="small">Held by {owner ? short(owner, 14, 8) : "unknown"}</p>}
      <dl className="summary traits">
        {s.traits.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <p className="small">
        <a href={`${EXPLORER[c.net]}/token/${s.unit}`} target="_blank" rel="noopener">View on explorer ↗</a>
      </p>
      {locked && <p className="warn">🔒 This skull is in a contract (see Rescue), not in your wallet itself.</p>}
      {mine && !locked && c.session && (
        <SendForm c={c} unit={s.unit} label={s.name} fixedQty={1n} onSent={onClose} />
      )}
    </Sheet>
  );
}
