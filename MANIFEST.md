# MANIFEST — Working Dead revival dapp
Generated 2026-11-24 01:58 UTC by `scripts/manifest.py` — do not edit.

## Toolchain
- aiken v1.1.24+bacbeb3 · Plutus V3 · stdlib v3.0.0
- Lucid Evolution 0.8.9 · Node v22.23.5

## Validators (hash changes = new on-chain address/policy)
- `course_badge.course_badge` → `b34df2b3ba8533635bbf6f11394de93222fe6ec0fb9cde10f9b8e7ee`
- `vault.vault` → `7016fdd35618802c1e9823e36949e5015f6d7a29e71262f55f6b7153`
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
- package id `app.workingdeadhub`
- last build `working-dead-hub-0.2.0.apk` sha256 `d821780155e5786e5fefe310c14a7f0ff0677e9441fa9097466d32f5f9cf120f`
- signing cert sha256 `190d8162f056d172a0d1890c62ae1983cfe6f7784d8a5cf8ac5343594731a2ee`

## Files
| path | sha256 | purpose |
|---|---|---|
| `.github/workflows/pages.yml` | `d5e74984a737` | Publishes the hub to GitHub Pages on every push to main. |
| `.vscode/extensions.json` | `7b0a07018972` | recommended VS Code extensions |
| `.vscode/settings.json` | `3237975ae7e4` | VS Code settings |
| `README.md` | `33f96013282c` | Working Dead Hub |
| `THIRD_PARTY_NOTICES.md` | `06f1a281e640` | Third-party notices |
| `android/base/README.md` | `c2ecec7f6eca` | Base APK |
| `android/build.py` | `1c63534a1f90` | Build the Working Dead Hub Android app from the web build in app/dist. |
| `android/tools/apkpkg.py` | `5d62541746cd` | Give the shell its own Android identity, so it installs beside (not over) Antelope Hub. |
| `android/tools/apksign.py` | `c615a359b6fd` | Sign an APK with v1 (JAR, via the JDK's jarsigner) and v2 (APK Signature Scheme v2, |
| `android/tools/arsc.py` | `fb70fce125bf` | From Antelope Hub (https://github.com/SquishEyez/ANThub), MIT licence, (c) 2026 SquishEyez |
| `android/tools/axml.py` | `14cc6cdd68bb` | From Antelope Hub (https://github.com/SquishEyez/ANThub), MIT licence, (c) 2026 SquishEyez |
| `android/tools/brand.py` | `4c6d490566c6` | Working Dead Hub branding, drawn procedurally (no image assets): a bone skull on a |
| `android/tools/verify.py` | `8ee6c300ee6b` | Independent checks on the finished APK (androguard + apksigtool), so a broken |
| `android/tools/zipalign.py` | `098001f40056` | Repack an extracted APK tree, keeping the base APK's entry order and compression, |
| `android/version.json` | `690ec7e280bb` | Android package id, label, versionCode |
| `app/index.html` | `b56b8b5b43c0` | web app entry page |
| `app/package.json` | `a1b68cd94125` | npm workspace config / dependencies |
| `app/src/App.tsx` | `10fef66bf41d` | hub shell: network chip, sign-in/watch, tabs, confirm sheet, toasts |
| `app/src/ctx.ts` | `80b6fb82ce71` |  |
| `app/src/env.ts` | `03034d76a9b5` | Build-time settings and runtime platform detection. |
| `app/src/links.ts` | `23f7010744e2` | Official links, from The Working Dead Discord #official-links. |
| `app/src/main.tsx` | `13729139e7ee` | React bootstrap |
| `app/src/pkh.ts` | `df3895b0644c` |  |
| `app/src/style.css` | `344a418aa89f` | web app look |
| `app/src/ui.tsx` | `a4811d6e4d51` |  |
| `app/src/views/Connect.tsx` | `25390ec68502` |  |
| `app/src/views/Contracts.tsx` | `a45cc443d556` |  |
| `app/src/views/Home.tsx` | `53d4eb35cff8` |  |
| `app/src/views/Lookup.tsx` | `59db0489cec4` |  |
| `app/src/views/More.tsx` | `21c75bcd449b` |  |
| `app/src/views/Send.tsx` | `dcfdbac78ca1` |  |
| `app/src/views/Skulls.tsx` | `c5355e0c0de8` |  |
| `app/src/views/Wisdom.tsx` | `ba34f999988b` |  |
| `app/src/views/Work.tsx` | `58b8f728bd46` |  |
| `app/src/vite-env.d.ts` | `d0ea7da30893` | <reference types="vite/client" /> |
| `app/src/wallet.ts` | `27f047c823f1` | Wallet access. Browser / wallet in-app browser: CIP-30 (window.cardano). |
| `app/tsconfig.json` | `802c20e229ec` | TypeScript settings |
| `app/vite.config.ts` | `83980da4f1ec` | bundler config (WASM + Node polyfills for Lucid) |
| `offchain/package.json` | `1bf559dc8bf2` | npm workspace config / dependencies |
| `offchain/test/emulator.test.ts` | `3efa23a3d6cd` | End-to-end tests against Lucid's in-memory Cardano emulator. |
| `offchain/test/fixtures.ts` | `869f9a9feb27` | Koios-shaped fixtures (field names from the Koios v1 OpenAPI spec). |
| `offchain/test/hub.test.ts` | `055434d58685` | Hub data layer: parsing, holdings, $handle resolution — against Koios-shaped fixtures. |
| `offchain/test/ui-smoke.mts` | `a08666919d8e` | Headless browser smoke test of the built hub (app/dist) with Koios mocked. |
| `onchain/aiken.toml` | `a606f3315a0f` | Aiken project + stdlib version |
| `onchain/lib/workingdead/time.ak` | `ddc98576b367` | Time helpers shared by validators. All times are POSIX milliseconds. |
| `onchain/validators/course_badge.ak` | `47c086ba1e1a` | COURSE BADGE — minting policy for proof-of-completion tokens. |
| `onchain/validators/vault.ak` | `571fd0052aa4` | VAULT — lock ADA or $WORK until a time, then only the owner may withdraw. |
| `package.json` | `a7e0f4d574ab` | npm workspace config / dependencies |
| `scripts/check.sh` | `2382d43ec3b5` | The one command that proves the build is good. Run it before every handoff. |
| `scripts/manifest.py` | `f19cb3988f58` | Writes MANIFEST.md from what is actually in the tree (never edited by hand). |
| `scripts/setup.sh` | `0954e196613d` | One-time setup. Needs Node 20+, Python 3, and (for the Android app) a JDK 17+. |
| `shared/contracts.ts` | `21e898730521` | Single source of truth for talking to the validators, used by both the |
| `shared/koios.ts` | `9ab7838f80be` | Minimal Koios client. Public tier, no key, CORS-enabled — works from a |
| `shared/package.json` | `5ca9971f9c81` | npm workspace config / dependencies |
| `shared/wd.ts` | `16a68c2fb304` | The Working Dead: on-chain identifiers and pure helpers (no network, no DOM). |
