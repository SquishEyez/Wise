// Rescue: find Working Dead assets a wallet still owns but can't see or move,
// because they sit in contracts whose websites are gone or quiet.
//
// Main case — Anvil staking vaults. Staking sent assets to a per-wallet native script
//   all[ after(unlockSlot), sig(K) ]   address = script(hash) + stake(K)
// where K is the wallet's stake key. Once the unlock time has passed, K's owner can
// spend it with a single signature. The script body is only published on-chain when
// spent, so we rebuild it from K and the unlock time and check its hash.
import { scriptFromNative, validatorToScriptHash, type Script } from "@lucid-evolution/lucid";
import { SKULL_POLICY, WORK_POLICY, WORK_NAME_HEX, skullNumber } from "./wd.ts";

export type NativeJson =
  | { type: "sig"; keyHash: string }
  | { type: "after" | "before"; slot: number }
  | { type: "all" | "any"; scripts: NativeJson[] }
  | { type: "atLeast"; required: number; scripts: NativeJson[] };

// Shelley mainnet clock
const SHELLEY_SLOT = 4492800, SHELLEY_UNIX = 1596059091;
export const slotToMs = (slot: number) => (SHELLEY_UNIX + (slot - SHELLEY_SLOT)) * 1000;
export const msToSlot = (ms: number) => SHELLEY_SLOT + Math.floor(ms / 1000) - SHELLEY_UNIX;

export const anvilLock = (keyHash: string, slot: number): NativeJson => ({
  type: "all",
  scripts: [{ type: "after", slot }, { type: "sig", keyHash }],
});
export const nativeScript = (j: NativeJson): Script => scriptFromNative(j as any);
export const nativeHash = (j: NativeJson) => validatorToScriptHash(nativeScript(j));

/** Unlock time from Anvil's CIP-20 lock message, as a slot. */
export function slotFromLockMessage(msg: string): number | null {
  const m = /locked until (.+?GMT)/i.exec(msg);
  const t = m ? Date.parse(m[1]) : NaN;
  return Number.isFinite(t) ? msToSlot(t) : null;
}

/** Try (key, slot ±1s) combinations; return the script whose hash matches. */
export function rebuildLock(scriptHash: string, keys: string[], slots: number[]): NativeJson | null {
  for (const k of keys) for (const s of slots) for (const d of [0, -1, 1]) {
    const j = anvilLock(k, s + d);
    if (nativeHash(j) === scriptHash) return j;
  }
  return null;
}

// ---------------------------------------------------------------- known contracts
/** Payment script hashes seen holding WD assets (from rescue/scan). */
export const KNOWN_CONTRACTS: Record<string, { name: string; kind: "market" | "dex-pool" | "dex-order"; url: string; how: string }> = {
  c727443d77df6cff95dca383994f4c3024d03ff56b02ecc22b0f3f65: { name: "jpg.store / Wayup listing", kind: "market", url: "https://www.wayup.io/", how: "Listed for sale. Cancel or change the listing on Wayup (it keeps jpg.store listings working)." },
  "9068a7a3f008803edac87af1619860f2cdcde40c26987325ace138ad": { name: "jpg.store / Wayup listing", kind: "market", url: "https://www.wayup.io/", how: "Listed for sale. Cancel or change the listing on Wayup." },
  a76f0fb801a29f591e9871576508d85b0b5f3c38774f65032f58fdad: { name: "jpg.store / Wayup offer or listing", kind: "market", url: "https://www.wayup.io/", how: "Open on Wayup to manage it." },
  ea07b733d932129c378af627436e7cbc2ef0bf96e0036bb51b3bde6b: { name: "Minswap V2 pool", kind: "dex-pool", url: "https://app.minswap.org/liquidity", how: "Liquidity: withdraw from Minswap → Liquidity." },
  e1317b152faac13426e6a83e06ff88a4d62cce3c1634ab0a5ec13309: { name: "Minswap V1 pool", kind: "dex-pool", url: "https://app.minswap.org/liquidity", how: "Old Minswap V1 liquidity: withdraw from Minswap → Liquidity (V1)." },
  c3e28c36c3447315ba5a56f33da6a6ddc1770a876a8d9f0cb3a97c4c: { name: "Minswap V2 order", kind: "dex-order", url: "https://app.minswap.org/orders", how: "An unfilled swap order. Cancel it on Minswap → Orders to get your $WORK/ADA back." },
  "00fb107bfbd51b3a5638867d3688e986ba38ff34fb738f5bd42b20d5": { name: "MuesliSwap order", kind: "dex-order", url: "https://muesliswap.com/", how: "An open order. Cancel it on MuesliSwap." },
};

// ---------------------------------------------------------------- per-wallet view
export type Utxo = {
  tx_hash: string; tx_index: number; address: string; value: string;
  asset_list?: { policy_id: string; asset_name: string | null; quantity: string }[] | null;
  payment_cred?: string; datum_hash?: string | null; inline_datum?: unknown; reference_script?: unknown;
};

export type Found = {
  scriptHash: string;
  address: string;
  utxos: Utxo[];
  skulls: number[];
  work: bigint;
  lovelace: bigint;
  kind: "anvil-vault" | "market" | "dex-pool" | "dex-order" | "other";
  name: string;
  how: string;
  url?: string;
  lock?: { native: NativeJson; unlockMs: number; signKey: string } | null;
};

/** Group a wallet's UTxOs that sit at script addresses and hold WD assets. */
export function groupScriptHoldings(utxos: Utxo[], isScriptAddress: (addr: string) => string | null): Map<string, Found> {
  const out = new Map<string, Found>();
  for (const u of utxos) {
    const hash = isScriptAddress(u.address);
    if (!hash) continue;
    let skulls: number[] = [], work = 0n;
    for (const a of u.asset_list ?? []) {
      if (a.policy_id === SKULL_POLICY) { const n = skullNumber(a.asset_name ?? ""); if (n) skulls.push(n); }
      if (a.policy_id === WORK_POLICY && a.asset_name === WORK_NAME_HEX) work += BigInt(a.quantity);
    }
    if (!skulls.length && !work) continue;
    const known = KNOWN_CONTRACTS[hash];
    const f = out.get(hash) ?? {
      scriptHash: hash, address: u.address, utxos: [], skulls: [], work: 0n, lovelace: 0n,
      kind: known?.kind ?? "other", name: known?.name ?? "Unidentified contract", how: known?.how ?? "", url: known?.url, lock: null,
    };
    f.utxos.push(u); f.skulls.push(...skulls); f.work += work; f.lovelace += BigInt(u.value);
    out.set(hash, f);
  }
  for (const f of out.values()) f.skulls.sort((a, b) => a - b);
  return out;
}

export const assetLabel = (f: Found) =>
  [f.skulls.length ? `${f.skulls.length} skull${f.skulls.length > 1 ? "s" : ""}` : "", f.work ? `${f.work.toLocaleString("en-GB")} $WORK` : ""].filter(Boolean).join(" + ");

