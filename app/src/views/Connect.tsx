import { useEffect, useState } from "react";
import { cip158Link, parseWatchInput, type Net } from "@wd/shared/wd";
import { detectWallets, type WalletInfo } from "../wallet.ts";
import { HUB_URL, IN_APP, openExternal } from "../env.ts";

const MOBILE_WALLETS = [
  { name: "VESPR", play: "https://play.google.com/store/apps/details?id=art.nft_craze.gallery.main" },
  { name: "Eternl", play: "https://play.google.com/store/apps/details?id=io.ccvault.v1.main" },
];

export function Connect({ net, onWallet, onWatch }: { net: Net; onWallet: (id: string) => void; onWatch: (raw: string) => void }) {
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [watch, setWatch] = useState("");
  useEffect(() => {
    const scan = () => setWallets(detectWallets());
    scan();
    const t = [setTimeout(scan, 400), setTimeout(scan, 1500)]; // wallets inject late
    return () => t.forEach(clearTimeout);
  }, []);
  const watchOk = !!parseWatchInput(watch);

  return (
    <div className="connect">
      <section className="card">
        <h2>Sign in</h2>
        {wallets.length > 0 ? (
          <>
            <p>Choose your wallet. It will ask you to sign a short message to prove it's yours. That's free and moves nothing.</p>
            <div className="wallets">
              {wallets.map((w) => (
                <button key={w.id} className="wallet" onClick={() => onWallet(w.id)}>
                  <img src={w.icon} alt="" /> {w.name}
                </button>
              ))}
            </div>
          </>
        ) : IN_APP ? (
          <>
            <p>Your wallet does the signing. Tap below: the hub opens inside VESPR (or Eternl), and you sign there.</p>
            {HUB_URL ? (
              <button className="primary wide" onClick={() => openExternal(cip158Link(HUB_URL))}>
                Open in VESPR / Eternl
              </button>
            ) : (
              <p className="warn">This build has no hub address set (VITE_HUB_URL), so it can't hand over to a wallet yet. Use "Watch" below.</p>
            )}
            <p className="small">
              Don't have one?{" "}
              {MOBILE_WALLETS.map((w, i) => (
                <span key={w.name}>
                  {i > 0 && " · "}
                  <a href="#" onClick={(e) => { e.preventDefault(); openExternal(w.play); }}>Get {w.name}</a>
                </span>
              ))}
            </p>
          </>
        ) : (
          <>
            <p>No Cardano wallet found in this browser.</p>
            <p className="small">
              Desktop: install the VESPR, Lace or Eternl extension. Phone: open this page from inside the VESPR or Eternl app
              {HUB_URL && (
                <>
                  {" — "}
                  <a href={cip158Link(HUB_URL)}>open in wallet</a>
                </>
              )}
              .
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2>Watch</h2>
        <p>Look at any wallet without signing in: an address, a stake address{net === "Mainnet" ? " or a $handle" : ""}.</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (watchOk) onWatch(watch); }}>
          <input aria-label="Address, stake address or $handle" placeholder={net === "Mainnet" ? "addr1… / stake1… / $handle" : "addr_test1… / stake_test1…"} value={watch} onChange={(e) => setWatch(e.target.value)} />
          <button disabled={!watchOk}>Watch</button>
        </form>
      </section>
    </div>
  );
}
