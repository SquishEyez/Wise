// Runs the Rescue scan for one wallet in the app: finds WD assets sitting in contracts
// under the wallet's stake key and works out how each can be got back.
import { getAddressDetails } from "@lucid-evolution/lucid";
import type { ChainData } from "@wd/shared/chain";
import * as R from "@wd/shared/rescue";
import registry from "./rescue-registry.json";

type Reg = Record<string, { native: R.NativeJson; unlockSlot: number }>;
const REG = registry as unknown as Reg;

const scriptHashOf = (addr: string) => {
  try { const d = getAddressDetails(addr); return d.paymentCredential?.type === "Script" ? d.paymentCredential.hash : null; } catch { return null; }
};

export async function scanWallet(chain: ChainData, stake: string, walletAddresses: string[]): Promise<R.Found[]> {
  const utxos = await chain.accountUtxos(stake);
  const found = [...R.groupScriptHoldings(utxos, scriptHashOf).values()];
  const stakeHash = getAddressDetails(stake).stakeCredential?.hash;
  const payHashes = walletAddresses.map((a) => { try { return getAddressDetails(a).paymentCredential?.hash; } catch { return undefined; } });
  const keys = [stakeHash, ...payHashes].filter(Boolean) as string[];

  for (const f of found) {
    if (f.kind !== "other") continue;
    // 1. the chain scan already rebuilt it
    let native: R.NativeJson | null = null;
    let lockMsgs: string[] = [];
    const reg = REG[f.scriptHash];
    if (reg && R.nativeHash(reg.native) === f.scriptHash) native = reg.native;
    // 2. rebuild live from the lock messages
    if (!native) {
      const msgs = await chain.scriptMessages(f.scriptHash, f.address).catch(() => []);
      lockMsgs = msgs.filter((m) => /locked until/i.test(m));
      const slots = msgs.map(R.slotFromLockMessage).filter((s): s is number => s !== null);
      native = slots.length ? R.rebuildLock(f.scriptHash, keys, slots) : null;
    }
    if (native && native.type === "all") {
      const after = native.scripts.find((s) => s.type === "after") as { slot: number } | undefined;
      const sig = native.scripts.find((s) => s.type === "sig") as { keyHash: string } | undefined;
      if (after && sig) {
        f.kind = "anvil-vault";
        f.name = "Anvil staking vault";
        f.how = "Locked by the old Working Dead staking portal. Only your wallet can open it, and the hub can do it for you.";
        f.lock = { native, unlockMs: R.slotToMs(after.slot), signKey: sig.keyHash };
      }
    }
    if (f.kind === "other" && lockMsgs.length) {
      f.name = "Early Anvil staking vault (2023)";
      f.how = `${lockMsgs[0].replace(/\s+/g, " ").trim()} This early vault design hasn't been decoded yet, so the hub can't open it. The assets are still yours, under your stake key, and the rescue scan will keep trying.`;
    } else if (f.kind === "other") f.how = "A contract this hub doesn't recognise yet. Open it on the explorer to see what it is.";
  }
  const order = { "anvil-vault": 0, "dex-order": 1, market: 2, "dex-pool": 3, other: 4 } as const;
  return found.sort((a, b) => order[a.kind] - order[b.kind] || b.skulls.length - a.skulls.length);
}
