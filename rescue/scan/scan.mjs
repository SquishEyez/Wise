// Working Dead chain scan. Finds every on-chain place Genesis skulls and $WORK sit,
// with a focus on smart-contract (script) addresses: staking, vaults, DEX pools,
// orders, marketplace listings. Output: out/scan.json + out/SCAN.md
//
//   node rescue/scan/scan.mjs            (needs internet; runs in GitHub Actions)
import { mkdirSync, writeFileSync } from "node:fs";
import { k, all, batched, calls } from "./koios.mjs";
import { decode } from "./addr.mjs";

const SKULL = "b06b24176f6feed7f6af241f12333b146497a43b13afad1c66699dea";
const WORK = "bbd0ec94cf9ccc1407b3dbc66bfbbff82ea49718ae4e3dceb817125f";
const WORK_NAME = "24574f524b";
const OUT = new URL("./out/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fromHex = (h) => { try { return Buffer.from(h, "hex").toString("utf8"); } catch { return h; } };

// ---------------------------------------------------------------- 1. holders
log("WORK holders…");
const workRows = await all(`/asset_addresses?_asset_policy=${WORK}&_asset_name=${WORK_NAME}`);
log("  rows", workRows.length);
log("skull holders…");
const skullRows = await all(`/policy_asset_addresses?_asset_policy=${SKULL}`);
log("  rows", skullRows.length);

const scripts = new Map(); // payment script hash -> aggregate
const S = (h) => scripts.get(h) ?? scripts.set(h, { hash: h, work: 0n, skulls: 0, addresses: new Set(), stakeKeys: new Set(), sampleAddress: null }).get(h);
let workTotal = 0n, workInScripts = 0n, workHolders = new Set(), skullsInScripts = 0, skullHolders = new Set();
const byon = { work: 0n, skulls: 0 };

for (const r of workRows) {
  const q = BigInt(r.quantity); workTotal += q;
  const d = decode(r.payment_address);
  if (!d) { byon.work += q; continue; }
  workHolders.add(r.stake_address ?? r.payment_address);
  if (d.paymentScript) { const s = S(d.payment); s.work += q; s.addresses.add(r.payment_address); s.sampleAddress ??= r.payment_address; if (r.stake_address) s.stakeKeys.add(r.stake_address); workInScripts += q; }
}
for (const r of skullRows) {
  if (BigInt(r.quantity) <= 0n) continue;
  const d = decode(r.payment_address);
  if (!d) { byon.skulls++; continue; }
  skullHolders.add(r.stake_address ?? r.payment_address);
  if (d.paymentScript) { const s = S(d.payment); s.skulls++; s.addresses.add(r.payment_address); s.sampleAddress ??= r.payment_address; if (r.stake_address) s.stakeKeys.add(r.stake_address); skullsInScripts++; }
}
log(`scripts holding WD assets: ${scripts.size}`);

// top key-address WORK holders (treasury / team / reward wallets are usually here)
const keyHolders = new Map();
for (const r of workRows) {
  const d = decode(r.payment_address); if (!d || d.paymentScript) continue;
  const id = r.stake_address ?? r.payment_address;
  keyHolders.set(id, (keyHolders.get(id) ?? 0n) + BigInt(r.quantity));
}
const topKeyHolders = [...keyHolders].sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, 25).map(([id, q]) => ({ id, work: q.toString() }));

// ---------------------------------------------------------------- 2. each script
const ranked = [...scripts.values()].sort((a, b) => b.skulls - a.skulls || (b.work > a.work ? 1 : -1));
const deep = ranked.slice(0, 40);
const info = await batched("/script_info", "_script_hashes", deep.map((s) => s.hash), 20);
const infoBy = Object.fromEntries(info.map((i) => [i.script_hash, i]));

for (const s of deep) {
  log("script", s.hash.slice(0, 12), "skulls", s.skulls, "WORK", s.work.toString());
  const i = infoBy[s.hash] ?? {};
  s.type = i.type ?? null; s.size = i.size ?? null; s.creation_tx = i.creation_tx_hash ?? null;
  // current UTxOs that hold WD assets
  const utxos = await k("/credential_utxos", { _payment_credentials: [s.hash], _extended: true }).catch((e) => (log("  utxos failed", e.message), []));
  const wd = utxos.filter((u) => (u.asset_list ?? []).some((a) => a.policy_id === SKULL || (a.policy_id === WORK && a.asset_name === WORK_NAME)));
  s.utxoCount = utxos.length; s.wdUtxoCount = wd.length;
  s.sampleUtxos = wd.slice(0, 8).map((u) => ({
    ref: `${u.tx_hash}#${u.tx_index}`, address: u.address, stake: u.stake_address, lovelace: u.value,
    datum_hash: u.datum_hash, inline_datum: u.inline_datum?.value ?? null, inline_bytes: u.inline_datum?.bytes ?? null,
    assets: (u.asset_list ?? []).map((a) => `${a.policy_id.slice(0, 8)}.${fromHex(a.asset_name ?? "")}=${a.quantity}`).slice(0, 12),
    has_reference_script: !!u.reference_script, block_time: u.block_time,
  }));
  // datum shapes: constructor + field kinds of every WD utxo
  const shapes = {};
  for (const u of wd) {
    const v = u.inline_datum?.value;
    const key = v ? shape(v) : u.datum_hash ? "datum_hash" : "no_datum";
    shapes[key] = (shapes[key] ?? 0) + 1;
  }
  s.datumShapes = shapes;
  // recent history: sample txs for labels (674 messages), redeemers, signers
  const txs = await k("/credential_txs", { _payment_credentials: [s.hash] }).catch(() => []);
  s.txCount = txs.length;
  s.firstSeen = txs.length ? Math.min(...txs.map((t) => t.block_time)) : null;
  s.lastSeen = txs.length ? Math.max(...txs.map((t) => t.block_time)) : null;
  const sample = [...txs].sort((a, b) => b.block_time - a.block_time).slice(0, 8).map((t) => t.tx_hash);
  if (sample.length) {
    const det = await k("/tx_info", { _tx_hashes: sample, _inputs: true, _metadata: true, _assets: false, _withdrawals: false, _certs: false, _scripts: true, _bytecode: false, _governance: false }).catch(() => []);
    s.labels = {}; s.redeemers = {}; s.spendCount = 0;
    s.sampleTxs = det.map((t) => {
      const msg = t.metadata?.["674"]?.msg; const text = Array.isArray(msg) ? msg.join(" ") : msg;
      for (const lbl of Object.keys(t.metadata ?? {})) s.labels[lbl] = (s.labels[lbl] ?? 0) + 1;
      const mine = (t.plutus_contracts ?? []).filter((c) => c.script_hash === s.hash);
      for (const c of mine) {
        const r = c.input?.redeemer;
        if (r?.purpose === "spend") s.spendCount++;
        const sh = r?.data?.value ? shape(r.data.value) : "?";
        s.redeemers[`${r?.purpose}:${sh}`] = (s.redeemers[`${r?.purpose}:${sh}`] ?? 0) + 1;
      }
      return { tx: t.tx_hash, time: t.tx_timestamp, msg674: text ?? null, metadataLabels: Object.keys(t.metadata ?? {}),
        contracts: (t.plutus_contracts ?? []).map((c) => ({ script: c.script_hash, purpose: c.input?.redeemer?.purpose, redeemer: c.input?.redeemer?.data?.value ?? null, datum: c.input?.datum?.value ?? null })) };
    });
  }
}

function shape(v, d = 0) {
  if (v === null || typeof v !== "object") return typeof v;
  if ("constructor" in v) return `C${v.constructor}(${(v.fields ?? []).map((f) => shape(f, d + 1)).join(",")})`;
  if ("bytes" in v) return `b${v.bytes.length / 2}`;
  if ("int" in v) return "i";
  if ("list" in v) return d > 2 ? "[..]" : `[${v.list.length ? shape(v.list[0], d + 1) : ""}]`;
  if ("map" in v) return "{map}";
  return "?";
}

// ---------------------------------------------------------------- 3. origins
log("origins…");
const policies = await k("/script_info", { _script_hashes: [SKULL, WORK] }).catch(() => []);
const workHist = await k(`/asset_history?_asset_policy=${WORK}&_asset_name=${WORK_NAME}`).catch(() => []);
const mintTxs = (workHist[0]?.minting_txs ?? []).map((m) => m.tx_hash).slice(0, 5);
const mintInfo = mintTxs.length ? await k("/tx_info", { _tx_hashes: mintTxs, _inputs: true, _metadata: true, _assets: true, _withdrawals: false, _certs: false, _scripts: false, _bytecode: false, _governance: false }).catch(() => []) : [];

// ---------------------------------------------------------------- report
const ser = (x) => JSON.parse(JSON.stringify(x, (_, v) => (typeof v === "bigint" ? v.toString() : v instanceof Set ? [...v].slice(0, 20) : v)));
const report = ser({
  generated: new Date().toISOString(), koiosCalls: calls,
  totals: { workSupplySeen: workTotal, workInScripts, workHolders: workHolders.size, skullRows: skullRows.length, skullHolders: skullHolders.size, skullsInScripts, byron: byon },
  policies, workMinting: mintInfo.map((t) => ({ tx: t.tx_hash, time: t.tx_timestamp, inputs: (t.inputs ?? []).map((i) => i.payment_addr?.bech32), outputs: (t.outputs ?? []).map((o) => ({ addr: o.payment_addr?.bech32, assets: (o.asset_list ?? []).filter((a) => a.policy_id === WORK).map((a) => a.quantity) })), metadata: t.metadata })),
  topKeyHolders,
  scripts: deep.map((s) => ({ ...s, addresses: [...s.addresses].slice(0, 5), stakeKeys: s.stakeKeys.size })),
  otherScripts: ranked.slice(40).map((s) => ({ hash: s.hash, work: s.work, skulls: s.skulls, sampleAddress: s.sampleAddress })),
});
writeFileSync(new URL("scan.json", OUT), JSON.stringify(report, null, 1));

const md = [`# Working Dead chain scan — ${report.generated}`, "",
  `- $WORK seen: ${report.totals.workSupplySeen} across ${report.totals.workHolders} wallets; **${report.totals.workInScripts} in scripts**`,
  `- Skulls: ${report.totals.skullRows} rows / ${report.totals.skullHolders} wallets; **${report.totals.skullsInScripts} in scripts**`, "",
  "| script | type | skulls | WORK | WD utxos / all | stake keys | txs | last seen | 674 msgs | redeemers | datum shapes |", "|---|---|---|---|---|---|---|---|---|---|---|",
  ...report.scripts.map((s) => `| \`${s.hash}\` | ${s.type} | ${s.skulls} | ${s.work} | ${s.wdUtxoCount}/${s.utxoCount} | ${s.stakeKeys} | ${s.txCount} | ${s.lastSeen ? new Date(s.lastSeen * 1000).toISOString().slice(0, 10) : ""} | ${[...new Set((s.sampleTxs ?? []).map((t) => t.msg674).filter(Boolean))].slice(0, 2).join(" / ").slice(0, 80)} | ${Object.entries(s.redeemers ?? {}).map(([a, n]) => `${a}×${n}`).join(" ").slice(0, 80)} | ${Object.entries(s.datumShapes ?? {}).map(([a, n]) => `${a}×${n}`).join(" ").slice(0, 100)} |`),
  "", "## Top key-address $WORK holders", ...report.topKeyHolders.map((h) => `- ${h.id}: ${h.work}`)].join("\n");
writeFileSync(new URL("SCAN.md", OUT), md);
console.log("\n" + md);
log("done, koios calls:", calls);
