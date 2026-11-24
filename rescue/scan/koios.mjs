// Tiny Koios client for the scanner: retries, pacing, pagination. No dependencies.
const BASE = process.env.KOIOS_URL ?? "https://api.koios.rest/api/v1";
const HEADERS = { accept: "application/json", "content-type": "application/json", ...(process.env.KOIOS_TOKEN ? { authorization: `Bearer ${process.env.KOIOS_TOKEN}` } : {}) };
let last = 0;
export let calls = 0;

async function pace() {
  const wait = last + 120 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

export async function k(path, body, { tries = 6 } = {}) {
  for (let i = 0; ; i++) {
    await pace();
    calls++;
    try {
      const res = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: HEADERS, body: body ? JSON.stringify(body) : undefined });
      if (res.ok) return await res.json();
      const txt = (await res.text()).slice(0, 200);
      if (i >= tries || (res.status < 500 && res.status !== 429)) throw new Error(`${res.status} ${path} ${txt}`);
    } catch (e) {
      if (i >= tries) throw e;
    }
    await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
  }
}

/** GET with offset pagination (PostgREST pages of 1000). */
export async function all(path, max = 200000) {
  const out = [];
  for (let off = 0; off < max; off += 1000) {
    const sep = path.includes("?") ? "&" : "?";
    const page = await k(`${path}${sep}offset=${off}&limit=1000`);
    out.push(...page);
    if (page.length < 1000) break;
  }
  return out;
}

/** POST in batches of n, concatenating results. */
export async function batched(path, key, items, n = 50, extra = {}) {
  const out = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await k(path, { [key]: items.slice(i, i + n), ...extra })));
  return out;
}
