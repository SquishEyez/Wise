import { useState } from "react";
import { parseWatchInput, short } from "@wd/shared/wd";
import type { Ctx } from "../ctx.ts";

/** Send a native token (a skull or $WORK) to an address or $handle. */
export function SendForm({ c, unit, label, fixedQty, max, onSent }: {
  c: Ctx; unit: string; label: string; fixedQty?: bigint; max?: bigint; onSent?: () => void;
}) {
  const [to, setTo] = useState("");
  const [qty, setQty] = useState("");
  const [err, setErr] = useState("");
  const amount = fixedQty ?? (/^\d+$/.test(qty) ? BigInt(qty) : 0n);
  const target = parseWatchInput(to);
  const ok = !!target && target.kind !== "stake" && amount > 0n && (max === undefined || amount <= max);

  async function review() {
    setErr("");
    try {
      const r = await c.chain.resolve(target!);
      const dest = r.addresses[0];
      c.confirm({
        title: `Send ${label}`,
        lines: [
          ["Send", `${fixedQty ? label : amount.toLocaleString("en-GB") + " " + label}`],
          ["To", r.label.startsWith("$") ? `${r.label} (${short(dest)})` : short(dest, 14, 8)],
          ["Network", c.net],
          ["Also sent", "a little ADA that must travel with tokens (~1.2 ADA) + fee"],
        ],
        warn: "Transfers on Cardano can't be reversed. Check the address.",
        run: async () => {
          const tx = await c.session!.lucid.newTx().pay.ToAddress(dest, { [unit]: amount }).complete();
          const signed = await tx.sign.withWallet().complete();
          const hash = await signed.submit();
          onSent?.();
          return hash;
        },
      });
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  return (
    <div className="send">
      <h4>Send</h4>
      <input placeholder="addr1… or $handle" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Recipient" />
      {!fixedQty && (
        <input inputMode="numeric" placeholder={`amount${max !== undefined ? ` (max ${max.toLocaleString("en-GB")})` : ""}`} value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} aria-label="Amount" />
      )}
      {err && <p className="error">{err}</p>}
      <button className="primary" disabled={!ok} onClick={review}>Review</button>
    </div>
  );
}
