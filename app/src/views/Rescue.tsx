import { useEffect, useState } from "react";
import { EXPLORER, short } from "@wd/shared/wd";
import * as R from "@wd/shared/rescue";
import type { Ctx } from "../ctx.ts";
import { openExternal } from "../env.ts";
import { pkhOf } from "../pkh.ts";
import { getAddressDetails } from "@lucid-evolution/lucid";

export type RescueState = { status: "idle" | "scanning" | "done" | "error"; found: R.Found[]; error?: string };

export function Rescue({ c, state, rescan }: { c: Ctx; state: RescueState; rescan: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);

  if (c.net !== "Mainnet") return <section className="card"><p>Rescue looks for real Working Dead assets, so it runs on Mainnet.</p></section>;
  if (!c.account.stake) return <section className="card"><p>Rescue needs a stake key. Watch a stake address or $handle, or sign in with a wallet.</p></section>;

  const s = c.session;
  const myStake = s?.stake ? getAddressDetails(s.stake).stakeCredential?.hash : null;
  const vaults = state.found.filter((f) => f.kind === "anvil-vault");
  const ready = vaults.filter((f) => f.lock && now > f.lock.unlockMs + 60_000 && !!s);

  function recover(list: R.Found[]) {
    // keep each transaction well inside Cardano's size limits (~100 skulls, 8 vaults)
    const batch: R.Found[] = [];
    let count = 0;
    for (const f of list) {
      if (batch.length && (batch.length >= 8 || count + f.skulls.length > 100)) break;
      batch.push(f); count += f.skulls.length;
    }
    const skulls = batch.reduce((n, f) => n + f.skulls.length, 0);
    const work = batch.reduce((n, f) => n + f.work, 0n);
    c.confirm({
      title: batch.length > 1 ? `Recover ${batch.length} vaults` : "Recover vault",
      lines: [
        ["Recover", [skulls ? `${skulls} skulls` : "", work ? `${work.toLocaleString("en-GB")} $WORK` : ""].filter(Boolean).join(" + ") || "ADA"],
        ["From", batch.length > 1 ? `${batch.length} Anvil staking vaults` : short(batch[0].address, 14, 8)],
        ["To", "your wallet"],
        ["Signature", "your stake key (that's how the vault was set up)"],
      ],
      warn: list.length > batch.length ? `${list.length - batch.length} more vaults after this one.` : undefined,
      run: async () => {
        let tx = s!.lucid.newTx();
        let from = Date.now() - 120_000;
        for (const f of batch) {
          const utxos = await s!.lucid.utxosAt(f.address);
          tx = tx.collectFrom(utxos).attach.SpendingValidator(R.nativeScript(f.lock!.native));
          from = Math.max(from, f.lock!.unlockMs + 1000);
        }
        const signKeys = [...new Set(batch.map((f) => f.lock!.signKey))];
        for (const k of signKeys) tx = tx.addSignerKey(k);
        const built = await tx.validFrom(from).complete();
        const hash = await (await built.sign.withWallet().complete()).submit();
        setTimeout(rescan, 45_000);
        return hash;
      },
    });
  }

  return (
    <div>
      <section className="card">
        <h2>Rescue</h2>
        <p className="small">Finds Working Dead skulls and $WORK that still belong to this wallet but are stuck in old contracts: staking vaults, listings, swap orders.</p>
        {state.status === "scanning" && <p className="busy">Digging through the chain…</p>}
        {state.status === "error" && <p className="error">{state.error}</p>}
        {state.status === "done" && !state.found.length && <p>Nothing stuck. Every Working Dead asset of this wallet is free to move.</p>}
        {state.status !== "scanning" && <button onClick={rescan}>Scan again</button>}
        {ready.length > 1 && <button className="primary" onClick={() => recover(ready)}>Recover all ({ready.length})</button>}
      </section>

      {state.found.map((f) => {
        const unlocked = f.lock ? now > f.lock.unlockMs + 60_000 : false;
        const mine = !!(f.lock && s && (f.lock.signKey === myStake || f.lock.signKey === pkhOf(s.address)));
        return (
          <section className={"card rescue " + f.kind} key={f.scriptHash}>
            <div className="rescue-head">
              <b>{f.name}</b>
              <span className="badge">{R.assetLabel(f)}</span>
            </div>
            {f.skulls.length > 0 && <p className="small mono">#{f.skulls.slice(0, 40).join(" #")}{f.skulls.length > 40 ? " …" : ""}</p>}
            <p className="small">{f.how}</p>
            {f.lock && s && !mine && <p className="warn">This vault was locked with a different key from the one this wallet signs with by default. Your wallet will say if it can't sign for it.</p>}
            {f.lock && (
              <p className="small">
                {unlocked ? `Unlocked since ${new Date(f.lock.unlockMs).toLocaleDateString("en-GB")}` : `Locked until ${new Date(f.lock.unlockMs).toLocaleString("en-GB")}`}
              </p>
            )}
            <div className="row">
              {f.kind === "anvil-vault" && (
                s ? (
                  <button className="primary" disabled={!unlocked} onClick={() => recover([f])}>
                    {unlocked ? "Recover to my wallet" : "Still locked"}
                  </button>
                ) : <span className="small">Sign in with this wallet to recover it.</span>
              )}
              {f.url && <button onClick={() => openExternal(f.url!)}>Open {new URL(f.url).hostname.replace("www.", "").replace("app.", "")} ↗</button>}
              <a className="small" href={`${EXPLORER[c.net]}/address/${f.address}`} target="_blank" rel="noopener">explorer ↗</a>
            </div>
          </section>
        );
      })}
    </div>
  );
}
