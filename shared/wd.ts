// The Working Dead: on-chain identifiers and pure helpers (no network, no DOM).

export type Net = "Mainnet" | "Preprod" | "Preview";
export const NETWORKS: Net[] = ["Mainnet", "Preprod", "Preview"];

export const KOIOS: Record<Net, string> = {
  Mainnet: "https://api.koios.rest/api/v1",
  Preprod: "https://preprod.koios.rest/api/v1",
  Preview: "https://preview.koios.rest/api/v1",
};

export const EXPLORER: Record<Net, string> = {
  Mainnet: "https://cardanoscan.io",
  Preprod: "https://preprod.cardanoscan.io",
  Preview: "https://preview.cardanoscan.io",
};

/** Genesis collection: 6,666 skulls named TheWorkingDead<n>. Mainnet. */
export const SKULL_POLICY = "b06b24176f6feed7f6af241f12333b146497a43b13afad1c66699dea";
export const SKULL_PREFIX = "TheWorkingDead";
export const SKULL_COUNT = 6666;

/** $WORK utility token, 0 decimals, 300M supply. Mainnet. */
export const WORK_POLICY = "bbd0ec94cf9ccc1407b3dbc66bfbbff82ea49718ae4e3dceb817125f";
export const WORK_NAME_HEX = "24574f524b"; // "$WORK"
export const WORK_UNIT = WORK_POLICY + WORK_NAME_HEX;

/** ADA Handle policy (mainnet). CIP-68 handles carry the 000de140 label prefix. */
export const HANDLE_POLICY = "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a";
export const CIP68_USER_PREFIX = "000de140";

export const IPFS_GATEWAYS = [
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
  "https://nftstorage.link/ipfs/",
];

// ---------------- text / hex ----------------

export const toHex = (s: string) =>
  Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, "0")).join("");

export const fromHex = (h: string) => {
  try {
    const bytes = new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return h;
  }
};

export const skullNameHex = (n: number) => toHex(SKULL_PREFIX + n);

export function skullNumber(assetNameHex: string): number | null {
  const m = /^TheWorkingDead(\d+)$/.exec(fromHex(assetNameHex));
  return m ? Number(m[1]) : null;
}

// ---------------- what the user typed in "watch" ----------------

export type WatchTarget =
  | { kind: "address"; value: string }
  | { kind: "stake"; value: string }
  | { kind: "handle"; value: string };

export function parseWatchInput(raw: string): WatchTarget | null {
  const s = raw.trim();
  if (/^\$[a-z0-9_.-]{1,15}$/i.test(s)) return { kind: "handle", value: s.slice(1).toLowerCase() };
  if (/^stake(_test)?1[02-9ac-hj-np-z]{20,}$/.test(s)) return { kind: "stake", value: s };
  if (/^addr(_test)?1[02-9ac-hj-np-z]{20,}$/.test(s)) return { kind: "address", value: s };
  return null;
}

export const handleNameHexes = (handle: string) => [toHex(handle), CIP68_USER_PREFIX + toHex(handle)];

// ---------------- CIP-25 metadata ----------------

export type Skull = {
  unit: string;
  number: number | null;
  name: string;
  image: string | null; // ipfs CID path (no scheme) or http(s) URL
  traits: [string, string][];
};

const SKIP_KEYS = new Set(["name", "image", "mediaType", "files", "description", "Website", "website", "twitter", "Twitter", "project", "Project"]);

/** Accepts ipfs://Qm…, ipfs://ipfs/Qm…, bare Qm…/bafy…, arrays of chunks, or http(s) URLs. */
export function normalizeImage(img: unknown): string | null {
  if (Array.isArray(img)) img = img.join("");
  if (typeof img !== "string" || !img) return null;
  let s = img.trim();
  if (/^https?:\/\//.test(s)) return s;
  s = s.replace(/^ipfs:\/\//, "").replace(/^ipfs\//, "");
  return /^(Qm|bafy)/.test(s) ? s : null;
}

export const gatewayUrls = (image: string | null) =>
  !image ? [] : /^https?:/.test(image) ? [image] : IPFS_GATEWAYS.map((g) => g + image);

function flatTraits(obj: Record<string, unknown>, prefix = ""): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (!prefix && SKIP_KEYS.has(k)) continue;
    if (v && typeof v === "object" && !Array.isArray(v)) out.push(...flatTraits(v as Record<string, unknown>, k + " · "));
    else out.push([prefix + k, Array.isArray(v) ? v.join("") : String(v)]);
  }
  return out;
}

/** Pull the CIP-25 (label 721) entry for one asset out of Koios asset_info. */
export function skullFromAssetInfo(info: {
  policy_id: string;
  asset_name: string | null;
  minting_tx_metadata: unknown;
}): Skull {
  const nameHex = info.asset_name ?? "";
  const ascii = fromHex(nameHex);
  const md = (info.minting_tx_metadata ?? {}) as Record<string, any>;
  const byPolicy = md["721"]?.[info.policy_id] ?? {};
  const entry: Record<string, unknown> = byPolicy[ascii] ?? byPolicy[nameHex] ?? {};
  return {
    unit: info.policy_id + nameHex,
    number: skullNumber(nameHex),
    name: typeof entry.name === "string" ? entry.name : ascii,
    image: normalizeImage(entry.image),
    traits: flatTraits(entry),
  };
}

// ---------------- holdings ----------------

export type AssetRow = { policy_id: string; asset_name: string | null; quantity: string };

export type Holdings = { skulls: string[]; work: bigint; otherAssets: number };

export function summarize(rows: AssetRow[]): Holdings {
  const skulls: string[] = [];
  let work = 0n;
  let otherAssets = 0;
  for (const r of rows) {
    const q = BigInt(r.quantity);
    if (q <= 0n) continue;
    if (r.policy_id === SKULL_POLICY) skulls.push(r.policy_id + (r.asset_name ?? ""));
    else if (r.policy_id === WORK_POLICY && r.asset_name === WORK_NAME_HEX) work += q;
    else otherAssets++;
  }
  const num = (u: string) => skullNumber(u.slice(56)) ?? 1e9;
  skulls.sort((a, b) => num(a) - num(b));
  return { skulls: [...new Set(skulls)], work, otherAssets };
}

export const fmtAda = (lovelace: bigint) =>
  (Number(lovelace) / 1e6).toLocaleString("en-GB", { maximumFractionDigits: 2 });

export const short = (s: string, a = 10, b = 6) => (s.length > a + b + 1 ? `${s.slice(0, a)}…${s.slice(-b)}` : s);

/** CIP-158: ask an installed wallet (VESPR, Eternl…) to open a URL in its dApp browser. */
export const cip158Link = (url: string) => `web+cardano://browse/v1?uri=${encodeURIComponent(url)}`;
