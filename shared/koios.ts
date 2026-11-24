// Minimal Koios client. Public tier, no key, CORS-enabled — works from a
// browser, the Android WebView and Node. `fetch` is injectable for tests.
import { KOIOS, SKULL_POLICY, HANDLE_POLICY, handleNameHexes, skullFromAssetInfo, type AssetRow, type Net, type Skull, type WatchTarget } from "./wd.ts";

type Fetch = typeof fetch;

export class KoiosClient {
  constructor(public net: Net, private f: Fetch = globalThis.fetch.bind(globalThis)) {}

  private async call<T>(path: string, body?: unknown): Promise<T> {
    const res = await this.f(KOIOS[this.net] + path, {
      method: body ? "POST" : "GET",
      headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`Koios ${path}: HTTP ${res.status}`);
    return (await res.json()) as T;
  }

  /** Resolve what the user typed into payment addresses + (optionally) a stake address. */
  async resolve(t: WatchTarget): Promise<{ addresses: string[]; stake: string | null; label: string }> {
    if (t.kind === "stake") return { addresses: [], stake: t.value, label: t.value };
    if (t.kind === "address") {
      const info = await this.call<{ stake_address: string | null }[]>("/address_info", { _addresses: [t.value] });
      return { addresses: [t.value], stake: info[0]?.stake_address ?? null, label: t.value };
    }
    if (this.net !== "Mainnet") throw new Error("$handles only resolve on Mainnet");
    for (const hex of handleNameHexes(t.value)) {
      const rows = await this.call<{ payment_address: string; stake_address: string | null }[]>(
        `/asset_addresses?_asset_policy=${HANDLE_POLICY}&_asset_name=${hex}`,
      );
      if (rows.length) return { addresses: [rows[0].payment_address], stake: rows[0].stake_address, label: "$" + t.value };
    }
    throw new Error(`$${t.value} not found`);
  }

  /** All assets + ADA for a wallet. Prefers the stake address (covers every address of the wallet). */
  async holdings(addresses: string[], stake: string | null): Promise<{ rows: AssetRow[]; lovelace: bigint }> {
    if (stake) {
      const [rows, acct] = await Promise.all([
        this.call<AssetRow[]>("/account_assets", { _stake_addresses: [stake] }),
        this.call<{ total_balance: string }[]>("/account_info", { _stake_addresses: [stake] }),
      ]);
      return { rows, lovelace: BigInt(acct[0]?.total_balance ?? "0") };
    }
    const [rows, info] = await Promise.all([
      this.call<AssetRow[]>("/address_assets", { _addresses: addresses }),
      this.call<{ balance: string }[]>("/address_info", { _addresses: addresses }),
    ]);
    return { rows, lovelace: info.reduce((s, i) => s + BigInt(i.balance ?? "0"), 0n) };
  }

  /** Metadata for many skulls (Koios takes batches). */
  async skulls(units: string[]): Promise<Skull[]> {
    const out: Skull[] = [];
    for (let i = 0; i < units.length; i += 50) {
      const batch = units.slice(i, i + 50).map((u) => [u.slice(0, 56), u.slice(56)]);
      const info = await this.call<any[]>("/asset_info", { _asset_list: batch });
      out.push(...info.map(skullFromAssetInfo));
    }
    return out.sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
  }

  /** Who holds a given skull right now. */
  async skullOwner(nameHex: string): Promise<{ payment_address: string; stake_address: string | null } | null> {
    const rows = await this.call<{ payment_address: string; stake_address: string | null; quantity: string }[]>(
      `/asset_addresses?_asset_policy=${SKULL_POLICY}&_asset_name=${nameHex}`,
    );
    return rows.find((r) => r.quantity !== "0") ?? null;
  }
}
