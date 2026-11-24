// Live check against mainnet: run the app's own Rescue scan for real stakers and
// print what it finds (read-only; nothing is signed or sent).
//   npx tsx rescue/scan/live-check.mts
import { credentialToRewardAddress } from "@lucid-evolution/lucid";
import { KoiosClient } from "@wd/shared/koios";
import { assetLabel } from "@wd/shared/rescue";
import { scanWallet } from "../../app/src/rescue.ts";

const STAKE_KEYS = (process.env.STAKE_KEYS ?? "b8ecb5486dc28e25d39fccc0346fb472c0ffef86b9011f73c1040f8c,b516c11e45dbf9dccd0e652a1f4d37c45492d5e3734967825e3b8dcc,74448fab03d359959c2b0f1170a46f726034e166021b5be1533c519e").split(",");
const koios = new KoiosClient("Mainnet");
let bad = 0;
for (const key of STAKE_KEYS) {
  const stake = credentialToRewardAddress("Mainnet", { type: "Key", hash: key });
  const found = await scanWallet(koios, stake, []);
  const vaults = found.filter((f) => f.kind === "anvil-vault");
  console.log(`\n${stake}: ${found.length} stuck place(s), ${vaults.length} openable vault(s)`);
  for (const f of found) console.log(`  ${f.kind.padEnd(12)} ${f.name.padEnd(34)} ${assetLabel(f).padEnd(28)} ${f.lock ? "unlock " + new Date(f.lock.unlockMs).toISOString().slice(0, 10) + " key " + f.lock.signKey.slice(0, 8) : ""}`);
  if (!vaults.length) bad++;
}
if (bad) { console.error(`${bad} sample staker(s) had no openable vault`); process.exit(1); }
