#!/usr/bin/env bash
# The one command that proves the build is good. Run it before every handoff.
#   1. Aiken format + unit tests + blueprint      (on-chain rules)
#   2. Emulator + hub data-layer tests            (real transactions, Koios-shaped fixtures)
#   3. Web app typecheck + production build
#   4. Headless browser smoke test                (skipped if no Chrome)
#   5. Android APK build + verification           (skipped if no JDK; set SKIP_APK=1 to skip)
#   6. Regenerate MANIFEST.md
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== on-chain ==";  (cd onchain && aiken fmt --check && aiken check && aiken build)
echo "== tests ==";     npm --workspace offchain test
echo "== app ==";       npm --workspace app run build
echo "== ui smoke ==";  EXPECT_HUB_URL=1 npm --workspace offchain run smoke
if [ -z "${SKIP_APK:-}" ] && command -v jarsigner >/dev/null; then
  echo "== android =="; python3 android/build.py
else
  echo "== android == skipped (no JDK or SKIP_APK set)"
fi
echo "== manifest =="; python3 scripts/manifest.py
echo "ALL GREEN"
