import { EXPLORER, WORK_UNIT } from "@wd/shared/wd";
import type { Ctx } from "../ctx.ts";
import { Stat } from "../ui.tsx";
import { SendForm } from "./Send.tsx";
import { openExternal } from "../env.ts";

export function Work({ c }: { c: Ctx }) {
  const bal = c.account.holdings.work;
  return (
    <div>
      <section className="card">
        <Stat label="$WORK balance" value={bal.toLocaleString("en-GB")} sub="300,000,000 total supply · 0 decimals" />
        <div className="links">
          <a href="#" onClick={(e) => { e.preventDefault(); openExternal(`https://minswap.org/tokens/${WORK_UNIT}`); }}>Trade on Minswap ↗</a>
          <a href="#" onClick={(e) => { e.preventDefault(); openExternal(`${EXPLORER.Mainnet}/token/${WORK_UNIT}`); }}>Token on explorer ↗</a>
        </div>
      </section>
      {c.session && bal > 0n && c.net === "Mainnet" && (
        <section className="card"><SendForm c={c} unit={WORK_UNIT} label="$WORK" max={bal} /></section>
      )}
      {!c.session && <p className="small center">Sign in with a wallet to send $WORK.</p>}
    </div>
  );
}
