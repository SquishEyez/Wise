#!/usr/bin/env python3
"""Turn the chain scan's vaults.json (chain-data branch) into the app's bundled registry.

  git fetch origin chain-data && git show origin/chain-data:vaults.json > /tmp/vaults.json
  python3 scripts/rescue_registry.py /tmp/vaults.json

Only vaults whose rebuilt script hash matched the chain go in. The app re-checks every
hash itself before using an entry, so a bad registry can never unlock the wrong thing.
"""
import json, sys, pathlib

src = json.load(open(sys.argv[1]))
reg = {}
for v in src["vaults"]:
    if v["status"] == "rebuilt" and v["native"]:
        reg[v["scriptHash"]] = {"native": v["native"], "unlockSlot": v["unlockSlot"]}
out = pathlib.Path(__file__).resolve().parent.parent / "app" / "src" / "rescue-registry.json"
out.write_text(json.dumps(reg, separators=(",", ":"), sort_keys=True))
print(f"registry: {len(reg)} vaults -> {out} ({out.stat().st_size // 1024} KB)")
