import { useState } from "react";
import { SKULL_COUNT, SKULL_POLICY, skullNameHex, type Skull } from "@wd/shared/wd";
import type { Ctx } from "../ctx.ts";
import { SkullSheet } from "./Skulls.tsx";

export function Lookup({ c }: { c: Ctx }) {
  const [n, setN] = useState("");
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ s: Skull; owner: string | null } | null>(null);
  const [err, setErr] = useState("");
  const num = Number(n);
  const ok = Number.isInteger(num) && num >= 1 && num <= SKULL_COUNT;

  async function look(k = num) {
    setBusy(true); setErr("");
    try {
      const hex = skullNameHex(k);
      const [[s], owner] = await Promise.all([c.koios.skulls([SKULL_POLICY + hex]), c.koios.skullOwner(hex)]);
      if (!s) throw new Error(`#${k} not found`);
      setFound({ s, owner: owner?.payment_address ?? null });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally { setBusy(false); }
  }

  if (c.net !== "Mainnet") return <section className="card"><p>The collection lives on Mainnet. Switch the network chip to look skulls up.</p></section>;
  return (
    <section className="card">
      <h2>Find a skull</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); if (ok) look(); }}>
        <input inputMode="numeric" placeholder={`1 – ${SKULL_COUNT}`} value={n} onChange={(e) => setN(e.target.value.replace(/\D/g, ""))} aria-label="Skull number" />
        <button disabled={!ok || busy}>{busy ? "…" : "Look up"}</button>
        <button type="button" className="ghost" disabled={busy} onClick={() => { const r = 1 + Math.floor(Math.random() * SKULL_COUNT); setN(String(r)); look(r); }}>🎲</button>
      </form>
      {err && <p className="error">{err}</p>}
      {found && <SkullSheet c={c} s={found.s} owner={found.owner} onClose={() => setFound(null)} />}
    </section>
  );
}
