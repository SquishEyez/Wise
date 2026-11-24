#!/usr/bin/env python3
"""Writes MANIFEST.md from what is actually in the tree (never edited by hand)."""
import hashlib, json, pathlib, subprocess, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
SKIP = {"node_modules", "dist", "build", ".git"}
EXTS = {".ak", ".ts", ".tsx", ".mts", ".css", ".html", ".sh", ".py", ".toml", ".json", ".md", ".yml", ".mjs"}
NOT = {"package-lock.json", "MANIFEST.md", "plutus.json"}

KNOWN = {
    "package.json": "npm workspace config / dependencies",
    "aiken.toml": "Aiken project + stdlib version",
    "tsconfig.json": "TypeScript settings",
    "index.html": "web app entry page",
    "main.tsx": "React bootstrap",
    "App.tsx": "hub shell: network chip, sign-in/watch, tabs, confirm sheet, toasts",
    "version.json": "Android package id, label, versionCode",
    "pages.yml": "GitHub Pages publish of the hub",
    "style.css": "web app look",
    "vite.config.ts": "bundler config (WASM + Node polyfills for Lucid)",
    "extensions.json": "recommended VS Code extensions",
    "settings.json": "VS Code settings",
}

def purpose(p: pathlib.Path) -> str:
    """First comment line of the file, else a known description."""
    for line in p.read_text(errors="ignore").splitlines()[:6]:
        s = line.strip()
        if s.startswith(("//", "# ", '"""')) and not s.startswith("#!"):
            return s.lstrip("/#\" ").rstrip('"').strip()[:90]
    return KNOWN.get(p.name, "")

def android_info():
    import glob
    apks = sorted(glob.glob(str(ROOT / "android/dist/*.apk")))
    fp = ROOT / "android/keystore/FINGERPRINT.txt"
    out = [f"- package id `{json.loads((ROOT / 'android/version.json').read_text())['packageId']}`"]
    if apks:
        p = pathlib.Path(apks[-1])
        out.append(f"- last build `{p.name}` sha256 `{hashlib.sha256(p.read_bytes()).hexdigest()}`")
    if fp.exists():
        out.append(f"- signing cert sha256 `{fp.read_text().strip()}`")
    return "\n".join(out)

def ver(cmd):
    try: return subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT).stdout.strip().splitlines()[0]
    except Exception: return "?"

rows = []
for p in sorted(ROOT.rglob("*")):
    if p.is_file() and p.suffix in EXTS and p.name not in NOT and not (SKIP & set(p.relative_to(ROOT).parts)):
        h = hashlib.sha256(p.read_bytes()).hexdigest()[:12]
        rows.append(f"| `{p.relative_to(ROOT)}` | `{h}` | {purpose(p)} |")

bp = json.loads((ROOT / "onchain/plutus.json").read_text())
vals = {v["title"].rsplit(".", 1)[0]: v["hash"] for v in bp["validators"]}
lucid = json.loads((ROOT / "node_modules/@lucid-evolution/lucid/package.json").read_text())["version"]

out = f"""# MANIFEST — Working Dead revival dapp
Generated {datetime.datetime.now(datetime.timezone.utc):%Y-%m-%d %H:%M UTC} by `scripts/manifest.py` — do not edit.

## Toolchain
- {ver(["aiken", "--version"])} · Plutus V3 · stdlib v3.0.0
- Lucid Evolution {lucid} · Node {ver(["node", "-v"])}

## Validators (hash changes = new on-chain address/policy)
""" + "\n".join(f"- `{k}` → `{h}`" for k, h in vals.items()) + """
  (course_badge hash above is *unparameterised*; the live policy ID depends on the issuer key)

## Invariants (enforced by tests)
- Vault: only the datum's owner can withdraw, and only in a tx whose validity starts at/after `unlock_after`.
- Badge: minting needs the issuer's signature and mints exactly 1 of each name; anyone may burn.
- Rejections in tests must come from the validator itself (`failed script execution`), not from tooling.
- Hub never holds keys. Every transaction goes through ConfirmSheet first, then the wallet's own approval.
- Watch mode is read-only: no Send/Bury buttons without a wallet session.
- Sign-in = CIP-8 signData on a fresh nonce, verified in-app (no tx, no fee).
- New contracts are testnet-only in the UI (Contracts tab is informational on Mainnet).
- Android app: own package id, no anchor:// esr:// handlers, WebView debugging off, v1+v2 signed, stored entries aligned.
- Skull policy b06b2417…99dea, $WORK unit bbd0ec94…125f24574f524b (shared/wd.ts) — mainnet.

## Android
""" + android_info() + """

## Files
| path | sha256 | purpose |
|---|---|---|
""" + "\n".join(rows) + "\n"
(ROOT / "MANIFEST.md").write_text(out)
print(f"MANIFEST.md: {len(rows)} files")
