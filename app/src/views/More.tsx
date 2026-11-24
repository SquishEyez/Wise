import { useState } from "react";
import type { Ctx } from "../ctx.ts";
import { VERSION, openExternal, IN_APP } from "../env.ts";
import { EXPLORER, short } from "@wd/shared/wd";
import { OFFICIAL } from "../links.ts";
import { Contracts } from "./Contracts.tsx";

export function More({ c, signOut }: { c: Ctx; signOut: () => void }) {
  const [contracts, setContracts] = useState(c.net !== "Mainnet");
  return (
    <div>
      <section className="card">
        <h2>Account</h2>
        <p className="mono small">{c.account.addresses[0] ? short(c.account.addresses[0], 20, 10) : c.account.stake}</p>
        {c.account.stake && (
          <p className="small"><a href={`${EXPLORER[c.net]}/stakekey/${c.account.stake}`} target="_blank" rel="noopener">Wallet on explorer ↗</a></p>
        )}
        <button onClick={signOut}>{c.session ? "Sign out" : "Stop watching"}</button>
      </section>

      {OFFICIAL.map((g) => (
        <section className="card" key={g.group}>
          <h2>{g.group}</h2>
          <ul className="linklist">
            {g.links.map(([label, url]) => (
              <li key={url}><a href="#" onClick={(e) => { e.preventDefault(); openExternal(url); }}>{label} ↗</a></li>
            ))}
          </ul>
        </section>
      ))}

      <section className="card">
        <h2>New contracts</h2>
        {contracts ? <Contracts c={c} /> : (
          <>
            <p className="small">The revival's crypt vault and course badges. These are on testnets until reviewed.</p>
            <button onClick={() => setContracts(true)}>Show</button>
          </>
        )}
      </section>

      <section className="card">
        <h2>Safety</h2>
        <ul className="small">
          <li>The hub never sees your keys or seed phrase. Your wallet signs, and you approve every transaction.</li>
          <li>Before anything is sent you see a summary. If you reject it in the wallet, nothing happens.</li>
          <li>No accounts, no tracking. Data comes from the public Koios API and IPFS.</li>
        </ul>
      </section>
      <p className="small center">Working Dead Hub {VERSION}{IN_APP ? " · Android" : ""} · open source · <a href="./licenses.txt">licences</a></p>
    </div>
  );
}
