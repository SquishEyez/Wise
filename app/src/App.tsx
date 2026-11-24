import { useEffect, useMemo, useState } from "react";
import { chainFor, browserBlocked } from "./source.ts";
import { explainFetchError } from "@wd/shared/chain";
import { NETWORKS, parseWatchInput, summarize, short, type Net } from "@wd/shared/wd";
import { connectWallet, proveOwnership, type Session } from "./wallet.ts";
import { store } from "./env.ts";
import type { Account, Ctx } from "./ctx.ts";
import { ConfirmSheet, type Summary } from "./ui.tsx";
import { Connect } from "./views/Connect.tsx";
import { Home } from "./views/Home.tsx";
import { Skulls } from "./views/Skulls.tsx";
import { Work } from "./views/Work.tsx";
import { Rescue, type RescueState } from "./views/Rescue.tsx";
import { scanWallet } from "./rescue.ts";
import { Wisdom } from "./views/Wisdom.tsx";
import { More } from "./views/More.tsx";

const TABS = [
  ["home", "Home", "☠"],
  ["skulls", "Skulls", "▦"],
  ["work", "$WORK", "⚒"],
  ["rescue", "Rescue", "⛏"],
  ["wisdom", "Wisdom", "✎"],
  ["more", "More", "≡"],
] as const;
type Tab = (typeof TABS)[number][0];

export function App() {
  const [net, setNet] = useState<Net>(((store.get("net") as Net) ?? "Mainnet"));
  const chain = useMemo(() => chainFor(net), [net]);
  const [tab, setTab] = useState<Tab>("home");
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [busy, setBusy] = useState("");
  const [toasts, setToasts] = useState<{ id: number; msg: string }[]>([]);
  const [confirm, setConfirm] = useState<Summary | null>(null);
  const [rescue, setRescue] = useState<RescueState>({ status: "idle", found: [] });

  async function runRescue(acc = account) {
    if (!acc?.stake || net !== "Mainnet") return;
    setRescue((r) => ({ ...r, status: "scanning" }));
    try { setRescue({ status: "done", found: await scanWallet(chain, acc.stake, acc.addresses) }); }
    catch (e: any) { setRescue({ status: "error", found: [], error: "Rescue scan failed: " + explainFetchError(e, chain.name) }); }
  }
  useEffect(() => { setRescue({ status: "idle", found: [] }); if (account) runRescue(account); }, [account?.stake, net]);

  const toast = (msg: string) => {
    msg = msg.split(" └─")[0].split("\n")[0];
    if (msg.length > 180) msg = msg.slice(0, 177) + "…";
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  };

  async function load(label: string, addresses: string[], stake: string | null) {
    setBusy("Raising the dead…");
    try {
      const { rows, lovelace } = await chain.holdings(addresses, stake);
      const holdings = summarize(rows);
      const skulls = holdings.skulls.length ? await chain.skulls(holdings.skulls) : [];
      setAccount({ label, addresses, stake, lovelace, holdings, skulls });
    } catch (e: any) {
      toast("Couldn't load wallet: " + explainFetchError(e, chain.name));
    } finally { setBusy(""); }
  }

  async function watch(raw: string) {
    const t = parseWatchInput(raw);
    if (!t) return;
    setBusy("Looking…");
    try {
      const r = await chain.resolve(t);
      store.set("watch", raw); store.set("wallet", null);
      await load(r.label, r.addresses, r.stake);
    } catch (e: any) { toast(explainFetchError(e, chain.name)); setBusy(""); }
  }

  async function signIn(id: string, silent = false) {
    setBusy("Opening wallet…");
    try {
      const s = await connectWallet(id, net);
      setSession(s);
      store.set("wallet", id); store.set("watch", null);
      await load(s.address, [s.address], s.stake);
      if (!silent) {
        try {
          const ok = await proveOwnership(s);
          setSession({ ...s, verified: ok });
          toast(ok ? "Signed in — wallet ownership proven" : "Signature didn't verify");
        } catch { toast("Message not signed — you're connected but not verified"); }
      }
    } catch (e: any) {
      toast(e?.info ?? explainFetchError(e, chain.name)); setBusy("");
    }
  }

  function signOut() {
    setSession(null); setAccount(null); setTab("home");
    store.set("wallet", null); store.set("watch", null);
  }

  // restore last session on start / network change
  useEffect(() => {
    setAccount(null); setSession(null);
    const w = store.get("wallet"), v = store.get("watch");
    if (w && (window as any).cardano?.[w]?.isEnabled) {
      (window as any).cardano[w].isEnabled().then((on: boolean) => on && signIn(w, true)).catch(() => {});
    } else if (v) watch(v);
  }, [net]);

  const changeNet = (n: Net) => { store.set("net", n); setNet(n); };

  const ctx: Ctx | null = account && {
    net, chain, account, session, toast,
    confirm: setConfirm,
    locked: new Set(rescue.found.flatMap((f) => f.skulls)),
    refresh: () => load(account.label, account.addresses, account.stake),
  };

  return (
    <div className="app">
      <header>
        <div className="brand"><span className="skull">☠</span> WORKING DEAD <small>HUB</small></div>
        <select className={"chip " + net.toLowerCase()} value={net} onChange={(e) => changeNet(e.target.value as Net)} aria-label="Network">
          {NETWORKS.map((n) => <option key={n}>{n}</option>)}
        </select>
      </header>

      <main>
        {busy && <div className="busy">{busy}</div>}
        {browserBlocked(net) && (
          <section className="card"><p className="warn">This build of the website has no Blockfrost key for {net}, and the keyless provider (Koios) is blocked inside browsers, so it can't read the chain. Use the Android app, or rebuild the site with a key.</p></section>
        )}
        {!ctx && !busy && <Connect net={net} onWallet={(id) => signIn(id)} onWatch={watch} />}
        {ctx && (
          <>
            {tab === "home" && <Home c={ctx} go={(t) => setTab(t as Tab)} stuck={rescue.found} />}
            {tab === "skulls" && <Skulls c={ctx} />}
            {tab === "work" && <Work c={ctx} />}
            {tab === "rescue" && <Rescue c={ctx} state={rescue} rescan={runRescue} />}
            {tab === "wisdom" && <Wisdom c={ctx} />}
            {tab === "more" && <More c={ctx} signOut={signOut} />}
          </>
        )}
      </main>

      {ctx && (
        <nav className="tabs">
          {TABS.map(([id, label, icon]) => (
            <button key={id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
      )}

      {confirm && (
        <ConfirmSheet
          s={confirm}
          onClose={() => setConfirm(null)}
          onDone={(hash) => {
            setConfirm(null);
            toast(`Sent ✓ ${short(hash, 8, 6)} — confirms in about a minute`);
            setTimeout(() => ctx?.refresh(), 40_000);
          }}
        />
      )}

      <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.msg}</div>)}</div>
    </div>
  );
}
