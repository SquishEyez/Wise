// Blockfrost backend for ChainData. Returns the same shapes as the Koios client so
// the rest of the hub doesn't care which one it talks to.
import type { ChainData } from "./chain.ts";
import type { Utxo } from "./rescue.ts";
import { HANDLE_POLICY, SKULL_POLICY, fromHex, handleNameHexes, skullFromAssetInfo, type AssetRow, type Net, type Skull, type WatchTarget } from "./wd.ts";

const BASE: Record<Net, string> = {
  Mainnet: "https://cardano-mainnet.blockfrost.io/api/v0",
  Preprod: "https://cardano-preprod.blockfrost.io/api/v0",
  Preview: "https://cardano-preview.blockfrost.io/api/v0",
};
export const blockfrostUrl = (net: Net) => BASE[net];

type Amount = { unit: string; quantity: string }[];
const toAssets = (amount: Amount) =>
  amount.filter((a) => a.unit !== "lovelace").map((a) => ({ policy_id: a.unit.slice(0, 56), asset_name: a.unit.slice(56), quantity: a.quantity }));
const lovelaceOf = (amount: Amount) => BigInt(amount.find((a) => a.unit === "lovelace")?.quantity ?? "0");

/** Script-payment Shelley address? (header types 1, 3, 5, 7 — CIP-19) */
function isScriptAddress(addr: string): boolean {
  if (!addr.startsWith("addr")) return false;
  const CH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const first = CH.indexOf(addr[addr.lastIndexOf("1") + 1]); // top 5 bits of the header byte
  return ((first >> 1) & 1) === 1; // header bit 4 = payment part is a script
}

export class BlockfrostClient implements ChainData {
  readonly name = "Blockfrost" as const;
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(public net: Net, private key: string, private f: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  private async slot<T>(job: () => Promise<T>): Promise<T> {
    if (this.active >= 5) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try { return await job(); } finally { this.active--; this.queue.shift()?.(); }
  }

  /** GET; 404 means "nothing there" and returns null. Retries on 429/5xx. */
  private get<T>(path: string): Promise<T | null> {
    return this.slot(async () => {
      for (let i = 0; ; i++) {
        const res = await this.f(BASE[this.net] + path, { headers: { project_id: this.key } });
        if (res.ok) return (await res.json()) as T;
        if (res.status === 404) return null;
        if (res.status === 403) throw new Error("Blockfrost rejected the project key (wrong network or invalid key)");
        if (i < 4 && (res.status === 429 || res.status >= 500)) { await new Promise((r) => setTimeout(r, 600 * 2 ** i)); continue; }
        throw new Error(`Blockfrost ${path}: HTTP ${res.status}`);
      }
    });
  }

  private async pages<T>(path: string, max = 50): Promise<T[]> {
    const out: T[] = [];
    for (let p = 1; p <= max; p++) {
      const page = (await this.get<T[]>(`${path}${path.includes("?") ? "&" : "?"}count=100&page=${p}`)) ?? [];
      out.push(...page);
      if (page.length < 100) break;
    }
    return out;
  }

  async resolve(t: WatchTarget) {
    if (t.kind === "stake") return { addresses: [], stake: t.value, label: t.value };
    if (t.kind === "address") {
      const a = await this.get<{ stake_address: string | null }>(`/addresses/${t.value}`);
      return { addresses: [t.value], stake: a?.stake_address ?? null, label: t.value };
    }
    if (this.net !== "Mainnet") throw new Error("$handles only resolve on Mainnet");
    for (const hex of handleNameHexes(t.value)) {
      const rows = await this.get<{ address: string }[]>(`/assets/${HANDLE_POLICY}${hex}/addresses`);
      if (rows?.length) {
        const a = await this.get<{ stake_address: string | null }>(`/addresses/${rows[0].address}`);
        return { addresses: [rows[0].address], stake: a?.stake_address ?? null, label: "$" + t.value };
      }
    }
    throw new Error(`$${t.value} not found`);
  }

  async holdings(addresses: string[], stake: string | null) {
    if (stake) {
      const [acct, assets] = await Promise.all([
        this.get<{ controlled_amount: string }>(`/accounts/${stake}`),
        this.pages<{ unit: string; quantity: string }>(`/accounts/${stake}/addresses/assets`),
      ]);
      const rows: AssetRow[] = assets.map((a) => ({ policy_id: a.unit.slice(0, 56), asset_name: a.unit.slice(56), quantity: a.quantity }));
      return { rows, lovelace: BigInt(acct?.controlled_amount ?? "0") };
    }
    const infos = await Promise.all(addresses.map((a) => this.get<{ amount: Amount }>(`/addresses/${a}`)));
    const rows: AssetRow[] = [];
    let lovelace = 0n;
    for (const i of infos) if (i) { rows.push(...toAssets(i.amount)); lovelace += lovelaceOf(i.amount); }
    return { rows, lovelace };
  }

  async skulls(units: string[]): Promise<Skull[]> {
    const infos = await Promise.all(units.map((u) => this.get<{ policy_id: string; asset_name: string | null; onchain_metadata: Record<string, unknown> | null }>(`/assets/${u}`)));
    return infos
      .filter((i): i is NonNullable<typeof i> => !!i)
      .map((i) => skullFromAssetInfo({
        policy_id: i.policy_id, asset_name: i.asset_name,
        // Blockfrost hands back the asset's own CIP-25 entry; wrap it the way Koios does
        minting_tx_metadata: { "721": { [i.policy_id]: { [fromHex(i.asset_name ?? "")]: i.onchain_metadata ?? {} } } },
      }))
      .sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
  }

  async skullOwner(nameHex: string) {
    const rows = await this.get<{ address: string; quantity: string }[]>(`/assets/${SKULL_POLICY}${nameHex}/addresses`);
    const r = rows?.find((x) => x.quantity !== "0");
    return r ? { payment_address: r.address, stake_address: null } : null;
  }

  async accountUtxos(stake: string): Promise<Utxo[]> {
    const addrs = (await this.pages<{ address: string }>(`/accounts/${stake}/addresses`)).map((a) => a.address).filter(isScriptAddress);
    const all = await Promise.all(addrs.map(async (address) => {
      const utxos = await this.pages<{ tx_hash: string; output_index: number; amount: Amount; data_hash: string | null; inline_datum: string | null }>(`/addresses/${address}/utxos`);
      return utxos.map((u) => ({ tx_hash: u.tx_hash, tx_index: u.output_index, address, value: String(lovelaceOf(u.amount)), asset_list: toAssets(u.amount), datum_hash: u.data_hash }));
    }));
    return all.flat();
  }

  async scriptMessages(_scriptHash: string, address: string): Promise<string[]> {
    const txs = (await this.get<{ tx_hash: string }[]>(`/addresses/${address}/transactions?count=100`)) ?? [];
    const metas = await Promise.all(txs.map((t) => this.get<{ label: string; json_metadata: any }[]>(`/txs/${t.tx_hash}/metadata`)));
    const out: string[] = [];
    for (const m of metas) for (const e of m ?? []) {
      if (e.label !== "674") continue;
      const raw = e.json_metadata?.msg;
      const text = Array.isArray(raw) ? raw.join("") : raw;
      if (typeof text === "string") out.push(text);
    }
    return out;
  }
}

export { isScriptAddress };
