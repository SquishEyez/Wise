// Rescue: rebuild the Anvil staking time-lock scripts that hold Working Dead assets.
//
// Anvil's "non-custodial staking" sent assets to a per-wallet native script:
//   all[ after(unlock_slot), sig(K) ]   at address  script(hash) + stake(K)
// where K is the staker's key and the unlock time is written in the lock tx's
// CIP-20 (674) message "Staking Contract Assets locked until <date>".
// A script's body only appears on-chain once it has been spent, so most locks are
// unknown to explorers and wallets. We rebuild each candidate from (K, slot) and keep
// it only if its blake2b-224 hash equals the address's payment credential.
//
//   node rescue/scan/vaults.mjs   -> out/vaults.json, out/VAULTS.md
import { mkdirSync, writeFileSync } from "node:fs";
import { k, all, batched, calls } from "./koios.mjs";
import { decode } from "./addr.mjs";
import { anvilLock, nativeHash, nativeCborHex, unixToSlot, slotToUnix } from "./native.mjs";

const SKULL = "b06b24176f6feed7f6af241f12333b146497a43b13afad1c66699dea";
const WORK = "bbd0ec94cf9ccc1407b3dbc66bfbbff82ea49718ae4e3dceb817125f", WORK_NAME = "24574f524b";
const OUT = new URL("./out/", import.meta.url);
mkdirSync(OUT, { recursive: true });
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fromHex = (h) => Buffer.from(h ?? "", "hex").toString("utf8");

// 1. every script address (payment=script, stake=key) holding a skull or $WORK
log("holders…");
const rows = [
  ...(await all(`/policy_asset_addresses?_asset_policy=${SKULL}`)),
  ...(await all(`/asset_addresses?_asset_policy=${WORK}&_asset_name=${WORK_NAME}`)),
];
const cands = new Map();
for (const r of rows) {
  const d = decode(r.payment_address);
  if (!d || d.type !== 1 || BigInt(r.quantity) <= 0n) continue; // script payment + key stake
  const c = cands.get(d.payment) ?? cands.set(d.payment, { hash: d.payment, stakeKey: d.stake, addresses: new Set() }).get(d.payment);
  c.addresses.add(r.payment_address);
}
log("candidate script addresses:", cands.size);

// 2. what the chain already knows (scripts that were spent at least once)
const known = Object.fromEntries((await batched("/script_info", "_script_hashes", [...cands.keys()], 50)).map((i) => [i.script_hash, i]));

// 3. per script: history, 674 messages, lock tx inputs, live UTxOs
const MSG = /locked until (.+?GMT)/i;
const results = [];
let n = 0;
for (const c of cands.values()) {
  if (++n % 50 === 0) log(`  ${n}/${cands.size}`);
  const txs = (await k("/credential_txs", { _payment_credentials: [c.hash] }).catch(() => [])).sort((a, b) => a.block_time - b.block_time);
  const meta = txs.length ? await batched("/tx_metadata", "_tx_hashes", txs.map((t) => t.tx_hash), 50).catch(() => []) : [];
  const msgs = [];
  for (const m of meta) {
    const raw = m.metadata?.["674"]?.msg; const text = Array.isArray(raw) ? raw.join("") : raw;
    const hit = text && MSG.exec(text);
    if (hit) { const t = Date.parse(hit[1]); if (Number.isFinite(t)) msgs.push({ tx: m.tx_hash, text, slot: unixToSlot(Math.floor(t / 1000)) }); }
  }
  const utxos = await k("/credential_utxos", { _payment_credentials: [c.hash], _extended: true }).catch(() => []);
  const skulls = [], held = { work: 0n, lovelace: 0n };
  for (const u of utxos) {
    held.lovelace += BigInt(u.value);
    for (const a of u.asset_list ?? []) {
      if (a.policy_id === SKULL) skulls.push(fromHex(a.asset_name));
      if (a.policy_id === WORK && a.asset_name === WORK_NAME) held.work += BigInt(a.quantity);
    }
  }

  // candidate keys: the address's stake key, plus keys of whoever funded the first tx
  const keys = new Set([c.stakeKey]);
  let lockInputs = [];
  if (txs.length) {
    const [first] = await k("/tx_info", { _tx_hashes: [txs[0].tx_hash], _inputs: true, _metadata: false, _assets: false, _withdrawals: false, _certs: false, _scripts: false, _bytecode: false, _governance: false }).catch(() => [null]);
    lockInputs = [...new Set((first?.inputs ?? []).map((i) => i.payment_addr?.bech32).filter(Boolean))];
    for (const a of lockInputs) { const d = decode(a); if (d && !d.paymentScript) { keys.add(d.payment); if (d.stake) keys.add(d.stake); } }
  }
  const slots = new Set(msgs.map((m) => m.slot));
  const kn = known[c.hash];
  if (kn?.value?.scripts) for (const s of kn.value.scripts) if (s.type === "after") slots.add(Number(s.slot));

  let match = null;
  for (const key of keys) for (const slot of slots) {
    for (const d of [-1, 0, 1]) { // tolerate a one-second rounding either way
      const script = anvilLock(key, slot + d);
      if (nativeHash(script) === c.hash) { match = { key, slot: slot + d, script }; break; }
    }
    if (match) break;
  }

  const lockerStakes = new Set(lockInputs.map((a) => decode(a)?.stake).filter(Boolean));
  const lockerPays = new Set(lockInputs.map((a) => decode(a)?.payment).filter(Boolean));
  results.push({
    scriptHash: c.hash,
    addresses: [...c.addresses],
    stakeKey: c.stakeKey,
    status: match ? "rebuilt" : kn ? "known-other" : "unknown",
    revealedOnChain: !!kn,
    native: match?.script ?? kn?.value ?? null,
    cbor: match ? nativeCborHex(match.script) : null,
    signKey: match?.key ?? null,
    signKeyRole: match ? (match.key === c.stakeKey ? "address stake key" : "") + (lockerStakes.has(match.key) ? " · locker's stake key" : "") + (lockerPays.has(match.key) ? " · locker's payment key" : "") : null,
    unlockSlot: match?.slot ?? null,
    unlockTime: match ? new Date(slotToUnix(match.slot) * 1000).toISOString() : null,
    unlockedNow: match ? slotToUnix(match.slot) * 1000 < Date.now() : null,
    lockMessages: msgs.slice(0, 3).map((m) => m.text),
    firstTx: txs[0]?.tx_hash ?? null, firstTime: txs[0] ? new Date(txs[0].block_time * 1000).toISOString() : null, txCount: txs.length,
    lockInputs,
    utxos: utxos.map((u) => `${u.tx_hash}#${u.tx_index}`),
    skulls: skulls.sort(), work: held.work.toString(), lovelace: held.lovelace.toString(),
  });
}

// 4. report
const sum = (f) => results.reduce((s, r) => s + f(r), 0);
const by = (st) => results.filter((r) => r.status === st);
const stats = {
  generated: new Date().toISOString(), koiosCalls: calls,
  scripts: results.length,
  rebuilt: by("rebuilt").length, knownOther: by("known-other").length, unknown: by("unknown").length,
  skulls: sum((r) => r.skulls.length), skullsRebuilt: sum((r) => (r.status === "rebuilt" ? r.skulls.length : 0)),
  work: results.reduce((s, r) => s + BigInt(r.work), 0n).toString(),
  workRebuilt: results.filter((r) => r.status === "rebuilt").reduce((s, r) => s + BigInt(r.work), 0n).toString(),
  stakers: new Set(results.map((r) => r.stakeKey)).size,
  signKeyRoles: results.reduce((m, r) => (r.signKeyRole && (m[r.signKeyRole] = (m[r.signKeyRole] ?? 0) + 1), m), {}),
  stillLocked: results.filter((r) => r.unlockedNow === false).length,
};
writeFileSync(new URL("vaults.json", OUT), JSON.stringify({ stats, vaults: results }, null, 1));
const md = [`# Anvil staking vaults holding Working Dead assets — ${stats.generated}`, "", "```json", JSON.stringify(stats, null, 1), "```", "",
  "## Not rebuilt", ...results.filter((r) => r.status !== "rebuilt").map((r) => `- \`${r.scriptHash}\` ${r.status} · ${r.skulls.length} skulls · ${r.work} WORK · txs ${r.txCount} · msgs ${JSON.stringify(r.lockMessages)} · native ${JSON.stringify(r.native)} · ${r.addresses[0]}`)].join("\n");
writeFileSync(new URL("VAULTS.md", OUT), md);
console.log(md.slice(0, 6000));
log("done");
