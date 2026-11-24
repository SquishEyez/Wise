// The hub's view of the chain. Two interchangeable backends:
//  - Koios (keyless). Mainnet answers don't carry CORS headers right now, so it only
//    works outside a browser page: Node, and the Android app (native HTTP).
//  - Blockfrost (needs a free project key). Browser-friendly, used by the website.
import type { AssetRow, Net, Skull, WatchTarget } from "./wd.ts";
import type { Utxo } from "./rescue.ts";

export interface ChainData {
  readonly net: Net;
  readonly name: "Koios" | "Blockfrost";
  resolve(t: WatchTarget): Promise<{ addresses: string[]; stake: string | null; label: string }>;
  holdings(addresses: string[], stake: string | null): Promise<{ rows: AssetRow[]; lovelace: bigint }>;
  skulls(units: string[]): Promise<Skull[]>;
  skullOwner(nameHex: string): Promise<{ payment_address: string; stake_address: string | null } | null>;
  /** UTxOs at script addresses that carry this stake key (vaults, listings, orders). */
  accountUtxos(stake: string): Promise<Utxo[]>;
  /** CIP-20 (674) messages on transactions touching a script address. */
  scriptMessages(scriptHash: string, address: string): Promise<string[]>;
}

/** Turn a fetch failure into something a person can act on. */
export function explainFetchError(e: unknown, provider: string): string {
  const m = String((e as any)?.message ?? e);
  if (/failed to fetch|transport error|networkerror|load failed/i.test(m))
    return `Couldn't reach ${provider}. Check your connection; if this keeps happening the site's data provider is blocking browsers.`;
  return m;
}
