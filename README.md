# Working Dead Hub

**Web:** https://squisheyez.github.io/Wise/ · **Android:** see [Releases](../../releases/latest)

A free wallet companion for **The Working Dead**, modelled on Antelope Hub but focused on one project. It runs as a web page and as an Android app.

- **Sign in with your own wallet** (VESPR, Eternl, Lace and others). The wallet signs a one-off message to prove it's yours. That's free and moves nothing.
- **Watch any wallet** by address, stake address or $handle, without signing in.
- **Skulls**: your Genesis skulls with pictures and traits. You can also send one.
- **$WORK**: your balance, sending, and links to Minswap and the explorer.
- **Lookup**: any skull #1 to #6,666, with its traits and current holder.
- **Contracts** (Preview/Preprod only for now): the crypt vault and course badges.
- **Wisdom**: the Wisdom. learn-to-earn platform (wisdom.courses): courses, teaching, docs.
- **Official links**: every platform, marketplace and channel from the Discord.

The hub never sees keys. Every transaction shows a summary first, then your wallet asks you to approve it.

## How signing works on a phone

Mobile wallets only sign for pages open in their **own** dApp browser. So the Android app does what it can on its own: watching, browsing skulls, lookups. When you tap **Sign in → Open in VESPR / Eternl**, it sends a CIP-158 link (`web+cardano://browse/v1?uri=…`) that opens the hosted hub inside your wallet, and you sign there. On a desktop browser with a wallet extension, sign-in happens directly.

That's why the hub lives at a public address: `.github/workflows/pages.yml` publishes it to **https://squisheyez.github.io/Wise/** on every push to `main`, and release builds hand over to that address (`app/.env.production`).

## Folders

```
app/       the hub (React + Lucid Evolution, data from the public Koios API)
shared/    Working Dead IDs + parsing (wd.ts), Koios client, contract helpers
onchain/   Aiken contracts: vault, course_badge
offchain/  tests: emulator transactions, hub data layer, headless browser smoke test
android/   APK build: Capacitor shell from Antelope Hub, re-identified, branded and signed
scripts/   setup.sh · check.sh · manifest.py
```

## Commands

| | |
|---|---|
| `bash scripts/setup.sh` | one-time install (Node 20+, Python 3, JDK 17+ for the APK) |
| `npm run dev` | run the hub locally |
| `npm run check` | everything: contracts, tests, app build, browser smoke test, APK, MANIFEST |
| `npm run apk` | just the web build + APK → `android/dist/working-dead-hub-<ver>.apk` |

## The APK and its key

`android/build.py` needs no Android SDK. It unpacks the base shell, swaps in the hub, changes the package id to `app.workingdeadhub` (so it installs alongside Antelope Hub, not over it), and removes the Anchor/ESR link handlers. It then redraws the icons procedurally, aligns, signs (v1 + v2) and verifies the result with androguard and apksigtool.

The first build creates the signing key in `android/keystore/`. **Back that folder up and never commit it.** Every update must be signed with the same key, or Android refuses to install it over the old version. The cert fingerprint is recorded in `MANIFEST.md`.

## Working on it

Open each session with `MANIFEST.md`. Claude edits the code and runs `npm run check` before handing anything back. When a validator hash in the manifest changes, its address/policy is new.
