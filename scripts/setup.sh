#!/usr/bin/env bash
# One-time setup. Needs Node 20+, Python 3, and (for the Android app) a JDK 17+.
set -euo pipefail
cd "$(dirname "$0")/.."
command -v aiken >/dev/null || npm install -g @aiken-lang/aiken@1.1.24
npm install
python3 -m pip install --user pillow cryptography androguard apksigtool 2>/dev/null \
  || python3 -m pip install --break-system-packages pillow cryptography androguard apksigtool
[ -f app/.env.local ] || cp app/.env.example app/.env.local
echo "Setup done. Fill in app/.env.local (hub + Wisdom addresses), then: npm run check"
