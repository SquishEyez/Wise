import { useEffect, useState } from "react";
import { Data, fromText, type UTxO } from "@lucid-evolution/lucid";
import * as C from "@wd/shared/contracts";
import { fmtAda, short } from "@wd/shared/wd";
import type { Ctx } from "../ctx.ts";
import { ISSUER_PKH } from "../env.ts";
import { pkhOf } from "../pkh.ts";

type Row = { utxo: UTxO; owner: string; unlock: number };
const read = (u: UTxO): Row | null => {
  try { const d = Data.from(u.datum!) as any; return { utxo: u, owner: d.fields[0], unlock: Number(d.fields[1]) }; } catch { return null; }
};

/** The revival's own contracts. Testnets only until reviewed. */
export function Contracts({ c }: { c: Ctx }) {
  if (c.net === "Mainnet")
    return <p className="small">The crypt vault and course badges run on <b>Preview</b> and <b>Preprod</b> until they've been reviewed. Switch the network chip to try them.</p>;
  if (!c.session) return <p className="small">Sign in with a wallet on {c.net} to use them.</p>;
  return (<><Vault c={c} /><Badges c={c} /></>);
}

function Vault({ c }: { c: Ctx }) {
  const s = c.session!;
  const me = pkhOf(s.address);
  const [rows, setRows] = useState<Row[]>([]);
  const [ada, setAda] = useState("5");
  const [mins, setMins] = useState("10");
  const [now, setNow] = useState(Date.now());

  const load = async () => setRows(((await s.lucid.utxosAt(C.vaultAddress(c.net))).map(read).filter(Boolean) as Row[]).filter((r) => r.owner === me));
  useEffect(() => { load().catch(() => {}); const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);

  return (
    <section>
      <h4>Crypt vault</h4>
      <p className="small">Bury ADA until a time you choose. After that, only you can dig it up.</p>
      <div className="row">
        <input inputMode="decimal" value={ada} onChange={(e) => setAda(e.target.value)} aria-label="ADA" /> ADA for
        <input inputMode="numeric" value={mins} onChange={(e) => setMins(e.target.value)} aria-label="Minutes" /> min
        <button className="primary" disabled={!(Number(ada) >= 2 && Number(mins) > 0)} onClick={() => {
          const unlock = Date.now() + Number(mins) * 60_000;
          c.confirm({
            title: "Bury in the crypt",
            lines: [["Lock", `${ada} ADA`], ["Unlocks", new Date(unlock).toLocaleString()], ["Only you can withdraw", short(me)], ["Network", c.net]],
            run: async () => {
              const tx = await s.lucid.newTx()
                .pay.ToContract(C.vaultAddress(c.net), { kind: "inline", value: C.vaultDatum(me, unlock) }, { lovelace: BigInt(Math.round(Number(ada) * 1e6)) })
                .complete();
              const h = await (await tx.sign.withWallet().complete()).submit();
              setTimeout(load, 30000);
              return h;
            },
          });
        }}>Bury</button>
      </div>
      {rows.map((r) => {
        const ready = now > r.unlock + 60_000; // slack for slot rounding
        return (
          <div className="row line" key={r.utxo.txHash + r.utxo.outputIndex}>
            <span>{fmtAda(r.utxo.assets.lovelace)} ADA · {ready ? "ready" : "unlocks " + new Date(r.unlock).toLocaleTimeString()}</span>
            <button disabled={!ready} onClick={() => c.confirm({
              title: "Exhume",
              lines: [["Withdraw", `${fmtAda(r.utxo.assets.lovelace)} ADA`], ["To", short(s.address, 14, 8)]],
              run: async () => {
                const tx = await s.lucid.newTx().collectFrom([r.utxo], C.Withdraw).attach.SpendingValidator(C.vaultScript)
                  .addSigner(s.address).validFrom(Date.now() - 60_000).complete();
                const h = await (await tx.sign.withWallet().complete()).submit();
                setTimeout(load, 30000);
                return h;
              },
            })}>Exhume</button>
          </div>
        );
      })}
    </section>
  );
}

function Badges({ c }: { c: Ctx }) {
  const s = c.session!;
  const me = pkhOf(s.address);
  const [course, setCourse] = useState("AIKEN101");
  const [student, setStudent] = useState("");
  const isIssuer = !!ISSUER_PKH && ISSUER_PKH === me;
  return (
    <section>
      <h4>Course badges</h4>
      <p className="small">Proof-of-completion tokens. Only the issuer key can mint them; holders can burn their own.</p>
      {isIssuer ? (
        <div className="row">
          <input value={course} onChange={(e) => setCourse(e.target.value.toUpperCase().slice(0, 32))} aria-label="Course code" />
          <input value={student} onChange={(e) => setStudent(e.target.value)} placeholder="student addr (blank = me)" aria-label="Student" />
          <button className="primary" disabled={!course} onClick={() => {
            const unit = C.badgePolicyId(ISSUER_PKH) + fromText(course);
            const to = student.trim() || s.address;
            c.confirm({
              title: "Issue badge",
              lines: [["Badge", course], ["To", short(to, 14, 8)], ["Policy", short(C.badgePolicyId(ISSUER_PKH), 10, 6)]],
              run: async () => {
                const tx = await s.lucid.newTx().mintAssets({ [unit]: 1n }, C.Issue).attach.MintingPolicy(C.badgePolicy(ISSUER_PKH))
                  .addSigner(s.address).pay.ToAddress(to, { [unit]: 1n }).complete();
                return (await tx.sign.withWallet().complete()).submit();
              },
            });
          }}>Issue</button>
        </div>
      ) : (
        <p className="small">Your key hash: <span className="mono">{me}</span>. To issue badges, build with VITE_ISSUER_PKH set to it.</p>
      )}
    </section>
  );
}
