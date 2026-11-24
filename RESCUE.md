# Rescue mission: Working Dead assets on-chain

The chain scan runs on GitHub Actions (`.github/workflows/chain-scan.yml`) against the public Koios API. Full results go to the `chain-data` branch: `scan.json`/`SCAN.md` for the holder and contract scan, and `vaults.json`/`VAULTS.md` for the vault rebuild.

## What we found (scan of 24 Nov 2026)

| | |
|---|---|
| Genesis skulls | 6,666, held by 1,084 wallets |
| Skulls sitting in contracts | **4,358** (65% of the collection) |
| …in Anvil staking vaults | **4,068 skulls + 41,371 $WORK** across 603 vaults, 416 stakers |
| $WORK | 300,000,000 supply; ~13.9M in contracts, mostly the Minswap pools |

### 1. Anvil staking vaults: the big one

The staking portal (staking.workingdead.io, run by Anvil) "locked" assets by sending them to a **per-wallet native script**:

```
all[ after(unlock_slot), sig(K) ]   address = script + stake(K)
```

K is the staker's own key, usually their stake key. The unlock time is written in the lock transaction's message (`Staking Contract Assets locked until <date>`). A native script's body is only published on-chain when it's spent, so wallets and explorers can't show these vaults or open them. Without the portal, the assets look stuck.

The scan **rebuilt 578 of the 603 vaults** from the address's stake key plus the lock message, and confirmed each one by its blake2b-224 hash. They cover **4,020 skulls and 29,924 $WORK**. Every unlock date (2023 to 2026) has passed, so each owner can take their assets back with one wallet signature. The hub's **Rescue** tab does it for them:

- It reads the wallet's UTxOs under its stake key and finds the vaults.
- It rebuilds each script from the bundled registry (`app/src/rescue-registry.json`) or live from the lock message, then re-checks the hash before using it.
- It builds `collectFrom(vault) + attach native script + required signer K + validFrom(unlock)`. The wallet signs, and everything returns to the wallet.

Tested on the emulator: vaults rebuilt from real mainnet hashes, recovery refused before the unlock time and for a stranger, and a full 50-skull vault recovered in one transaction.

**Not yet rebuilt: 17 early vaults** (Feb–Mar 2023, message "Staking ContractAssets locked until…"), holding **48 skulls + 11,447 $WORK**. They don't match the later design, even with ±2 hours of slot drift, either key order, or `any` in place of `all`. The scripts may be Plutus or contain an extra key. The hub lists them as found but not yet openable.

### 2. Marketplace listings (Wayup / jpg.store)

About 270 skulls are listed in the jpg.store contracts that Wayup (also Anvil) keeps working. Owners cancel or change listings on wayup.io. The hub flags them under Rescue.

### 3. $WORK liquidity and orders

- About 13.0M $WORK sits in the **Minswap V2** pool and about 0.87M in the old **Minswap V1** pool. LP holders withdraw on Minswap.
- Open orders hold $WORK in the **Minswap V2** order contract and a **MuesliSwap** order. The hub flags any that belong to the wallet, with a link to cancel them.

### Not on-chain

The Wisdom. platform's $WORK balances and rewards, and Anvil's reward claims, live on their servers, not on-chain. Nothing on-chain can recover them.
