import { useState, type ReactNode } from "react";
import { gatewayUrls } from "@wd/shared/wd";

/** Image that walks through IPFS gateways until one loads. */
export function IpfsImg({ image, alt, className }: { image: string | null; alt: string; className?: string }) {
  const urls = gatewayUrls(image);
  const [i, setI] = useState(0);
  if (!urls.length || i >= urls.length) return <div className={"img-missing " + (className ?? "")}>☠</div>;
  return <img className={className} src={urls[i]} alt={alt} loading="lazy" onError={() => setI(i + 1)} />;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="sheet-head">
          <h3>{title}</h3>
          <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export type Summary = { title: string; lines: [string, string][]; warn?: string; run: () => Promise<string> };

/** Every transaction goes through this: show exactly what happens, then the wallet asks to approve. */
export function ConfirmSheet({ s, onClose, onDone }: { s: Summary; onClose: () => void; onDone: (hash: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Sheet title={s.title} onClose={busy ? () => {} : onClose}>
      <dl className="summary">
        {s.lines.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {s.warn && <p className="warn">{s.warn}</p>}
      {err && <p className="error">{err}</p>}
      <button
        className="primary wide"
        disabled={busy}
        onClick={async () => {
          setBusy(true); setErr("");
          try { onDone(await s.run()); } catch (e: any) { setErr(e?.info ?? e?.message ?? String(e)); setBusy(false); }
        }}
      >
        {busy ? "Waiting for your wallet…" : "Approve in wallet"}
      </button>
      <p className="small">Nothing is sent until your wallet asks and you approve. Rejecting cancels it.</p>
    </Sheet>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
