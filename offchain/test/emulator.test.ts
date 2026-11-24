// End-to-end tests against Lucid's in-memory Cardano emulator.
// No network, no keys, no ADA — runs anywhere with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Emulator,
  fromText,
  generateEmulatorAccount,
  getAddressDetails,
  Lucid,
  type LucidEvolution,
} from "@lucid-evolution/lucid";
import * as C from "@wd/shared/contracts";

// A rejection only counts if the validator itself said no.
const SCRIPT_FAIL = /failed script execution/;

const pkhOf = (addr: string) => getAddressDetails(addr).paymentCredential!.hash;

async function setup() {
  const alice = generateEmulatorAccount({ lovelace: 100_000_000n });
  const bob = generateEmulatorAccount({ lovelace: 100_000_000n });
  const emulator = new Emulator([alice, bob]);
  const lucid = await Lucid(emulator, "Custom");
  const as = (acc: typeof alice) => lucid.selectWallet.fromSeed(acc.seedPhrase);
  return { emulator, lucid, alice, bob, as };
}

async function submit(lucid: LucidEvolution, build: Promise<any>, emulator: Emulator) {
  const tx = await build;
  const signed = await tx.sign.withWallet().complete();
  const hash = await signed.submit();
  emulator.awaitBlock(1);
  return hash;
}

test("vault: lock, early withdraw rejected, stranger rejected, owner withdraws after unlock", async () => {
  const { emulator, lucid, alice, bob, as } = await setup();
  const vault = C.vaultAddress("Custom");
  const unlock = emulator.now() + 60_000; // one minute from now

  as(alice);
  await submit(
    lucid,
    lucid
      .newTx()
      .pay.ToContract(vault, { kind: "inline", value: C.vaultDatum(pkhOf(alice.address), unlock) }, { lovelace: 10_000_000n })
      .complete(),
    emulator,
  );
  const [locked] = await lucid.utxosAt(vault);
  assert.equal(locked.assets.lovelace, 10_000_000n);

  const withdraw = (who: typeof alice) =>
    lucid
      .newTx()
      .collectFrom([locked], C.Withdraw)
      .attach.SpendingValidator(C.vaultScript)
      .addSigner(who.address)
      .validFrom(emulator.now())
      .complete();

  as(alice);
  await assert.rejects(withdraw(alice), SCRIPT_FAIL, "withdraw before unlock must fail");

  emulator.awaitSlot(120); // move past unlock time

  as(bob);
  await assert.rejects(withdraw(bob), SCRIPT_FAIL, "stranger must not withdraw");

  as(alice);
  await submit(lucid, withdraw(alice), emulator);
  assert.equal((await lucid.utxosAt(vault)).length, 0);
});

test("course badge: issuer mints one, non-issuer rejected, holder burns", async () => {
  const { emulator, lucid, alice, bob, as } = await setup();
  const issuer = pkhOf(alice.address);
  const policy = C.badgePolicy(issuer);
  const unit = C.badgePolicyId(issuer) + fromText("AIKEN101");

  // Bob (not the issuer) tries to mint himself a badge
  as(bob);
  await assert.rejects(lucid.newTx().mintAssets({ [unit]: 1n }, C.Issue).attach.MintingPolicy(policy).addSigner(bob.address).complete(),
    SCRIPT_FAIL,
  );

  // Alice (issuer) mints a badge straight to Bob
  as(alice);
  await submit(
    lucid,
    lucid
      .newTx()
      .mintAssets({ [unit]: 1n }, C.Issue)
      .attach.MintingPolicy(policy)
      .addSigner(alice.address)
      .pay.ToAddress(bob.address, { [unit]: 1n })
      .complete(),
    emulator,
  );
  const bobUtxos = await lucid.utxosAt(bob.address);
  assert.ok(bobUtxos.some((u) => u.assets[unit] === 1n), SCRIPT_FAIL, "bob holds the badge");

  // Minting two copies is rejected even by the issuer
  await assert.rejects(lucid.newTx().mintAssets({ [unit]: 2n }, C.Issue).attach.MintingPolicy(policy).addSigner(alice.address).complete(),
    SCRIPT_FAIL,
  );

  // Bob burns his badge
  as(bob);
  await submit(lucid, lucid.newTx().mintAssets({ [unit]: -1n }, C.Burn).attach.MintingPolicy(policy).complete(), emulator);
  const after = await lucid.utxosAt(bob.address);
  assert.ok(!after.some((u) => (u.assets[unit] ?? 0n) > 0n), SCRIPT_FAIL, "badge burned");
});
