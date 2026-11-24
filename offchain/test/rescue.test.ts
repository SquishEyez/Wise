// Rescue: rebuild an Anvil-style staking vault and unlock it with the staker's wallet,
// on Lucid's emulator — the same transaction the hub builds on mainnet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { Emulator, generateEmulatorAccount, getAddressDetails, Lucid, validatorToAddress } from "@lucid-evolution/lucid";
import * as R from "@wd/shared/rescue";
import { SKULL_POLICY, skullNameHex, WORK_UNIT } from "@wd/shared/wd";

// a rejection only counts if the ledger refused the vault's own native script
const NATIVE_FAIL = /Invalid native script witness/;
const S1 = SKULL_POLICY + skullNameHex(42), S2 = SKULL_POLICY + skullNameHex(1311);

test("rebuilds the real mainnet vaults found by the chain scan", () => {
  // three vaults whose scripts were later revealed on-chain (rescue/scan, chain-data branch)
  const cases: [string, string, number][] = [
    ["1a412e534a4c8395e6294d958690f0eceaa7a224e5b9109157a1ad78", "75692f734f16b03b7d1bf798af86a508b680dc7eeda84b7cbd4c2f44", 110196963],
    ["ac838d4bb89171515558244b03be8260b4808441223cbc6272cacca7", "87e838fbd2b0d0b32eb8ad9c4f53e7569eb5adf992a967f6d7bb360f", 89663076],
    ["0f423a093bae666ce8f12785f3b07996646418e4f825d02a97ba2a65", "e84d440753b55eedbe2f00a9981eecf1cfd4d125fdfa2dfa0ce8e105", 102135902],
  ];
  for (const [hash, key, slot] of cases) assert.equal(R.nativeHash(R.anvilLock(key, slot)), hash);
  // slot recovered from the lock tx's own message
  assert.equal(R.slotFromLockMessage("Staking Contract Assets locked until Sun, 03 Sep 2023 00:49:53 GMT."), 102135902);
  assert.deepEqual(R.rebuildLock(cases[2][0], ["00".repeat(28), cases[2][1]], [102135903]), R.anvilLock(cases[2][1], 102135902));
  assert.equal(R.rebuildLock(cases[2][0], [cases[0][1]], [102135902]), null);
});

test("vault unlock: early → rejected, stranger → rejected, staker after unlock → assets home", async () => {
  const alice = generateEmulatorAccount({ lovelace: 80_000_000n, [S1]: 1n, [S2]: 1n, [WORK_UNIT]: 5000n });
  const bob = generateEmulatorAccount({ lovelace: 80_000_000n });
  const emulator = new Emulator([alice, bob]);
  const lucid = await Lucid(emulator, "Custom");
  const aliceStake = getAddressDetails(alice.address).stakeCredential!.hash;

  // lock like Anvil did: script payment part + the staker's own stake key
  const slotOf = (ms: number) => emulator.slot + Math.floor((ms - emulator.now()) / 1000); // emulator: 1 slot = 1 s
  const unlockMs = emulator.now() + 10 * 60_000;
  const unlockSlot = slotOf(unlockMs);
  const lock = R.anvilLock(aliceStake, unlockSlot);
  const script = R.nativeScript(lock);
  const vault = validatorToAddress("Custom", script, { type: "Key", hash: aliceStake });
  lucid.selectWallet.fromSeed(alice.seedPhrase);
  const lockTx = await lucid.newTx().pay.ToAddress(vault, { lovelace: 3_000_000n, [S1]: 1n, [S2]: 1n, [WORK_UNIT]: 5000n }).complete();
  await (await lockTx.sign.withWallet().complete()).submit();
  emulator.awaitBlock(1);

  // the hub's view: group by script, then rebuild from the wallet's keys + unlock slot
  const raw = await lucid.utxosAt(vault);
  const koiosShape = raw.map((u) => ({
    tx_hash: u.txHash, tx_index: u.outputIndex, address: u.address, value: String(u.assets.lovelace),
    asset_list: Object.entries(u.assets).filter(([k]) => k !== "lovelace").map(([k, q]) => ({ policy_id: k.slice(0, 56), asset_name: k.slice(56), quantity: String(q) })),
  }));
  const found = R.groupScriptHoldings(koiosShape, (a) => { const d = getAddressDetails(a); return d.paymentCredential?.type === "Script" ? d.paymentCredential.hash : null; });
  const f = found.get(R.nativeHash(lock))!;
  assert.deepEqual(f.skulls, [42, 1311]);
  assert.equal(f.work, 5000n);
  const alicePay = getAddressDetails(alice.address).paymentCredential!.hash;
  assert.deepEqual(R.rebuildLock(f.scriptHash, [alicePay, aliceStake], [unlockSlot]), lock);

  const unlock = (signKey: string, from: number) =>
    lucid.newTx().collectFrom(raw).attach.SpendingValidator(script).addSignerKey(signKey).validFrom(from).complete()
      .then((tx) => tx.sign.withWallet().complete()).then((s) => s.submit());

  await assert.rejects(unlock(aliceStake, emulator.now()), NATIVE_FAIL);
  emulator.awaitSlot(700);
  lucid.selectWallet.fromSeed(bob.seedPhrase);
  await assert.rejects(unlock(getAddressDetails(bob.address).stakeCredential!.hash, emulator.now()), NATIVE_FAIL);
  await assert.rejects(unlock(aliceStake, emulator.now()), NATIVE_FAIL);

  lucid.selectWallet.fromSeed(alice.seedPhrase);
  await unlock(aliceStake, emulator.now());
  emulator.awaitBlock(1);
  assert.equal((await lucid.utxosAt(vault)).length, 0, "vault emptied");
  const home = await lucid.utxosAt(alice.address);
  const has = (unit: string) => home.reduce((s, u) => s + (u.assets[unit] ?? 0n), 0n);
  assert.equal(has(S1) + has(S2), 2n, "skulls back in alice's wallet");
  assert.equal(has(WORK_UNIT), 5000n, "$WORK back too");
});

test("a full 50-skull vault (the common mainnet size) recovers in one transaction", async () => {
  const units = Array.from({ length: 50 }, (_, i) => SKULL_POLICY + skullNameHex(1300 + i));
  const alice = generateEmulatorAccount({ lovelace: 80_000_000n, ...Object.fromEntries(units.map((u) => [u, 1n])) });
  const emulator = new Emulator([alice]);
  const lucid = await Lucid(emulator, "Custom");
  lucid.selectWallet.fromSeed(alice.seedPhrase);
  const stake = getAddressDetails(alice.address).stakeCredential!.hash;
  const lock = R.anvilLock(stake, emulator.slot + 5);
  const vault = validatorToAddress("Custom", R.nativeScript(lock), { type: "Key", hash: stake });
  const l = await lucid.newTx().pay.ToAddress(vault, { lovelace: 5_000_000n, ...Object.fromEntries(units.map((u) => [u, 1n])) }).complete();
  await (await l.sign.withWallet().complete()).submit();
  emulator.awaitSlot(30);
  const tx = await lucid.newTx().collectFrom(await lucid.utxosAt(vault)).attach.SpendingValidator(R.nativeScript(lock))
    .addSignerKey(stake).validFrom(emulator.now()).complete();
  const signed = await tx.sign.withWallet().complete();
  assert.ok(signed.toCBOR().length / 2 < 16384, `tx size ${signed.toCBOR().length / 2} bytes`);
  await signed.submit();
  emulator.awaitBlock(1);
  const home = await lucid.utxosAt(alice.address);
  assert.equal(units.filter((u) => home.some((x) => x.assets[u] === 1n)).length, 50);
});
