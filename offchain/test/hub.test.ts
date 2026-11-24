// Hub data layer: parsing, holdings, $handle resolution — against Koios-shaped fixtures.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as W from "@wd/shared/wd";
import { KoiosClient } from "@wd/shared/koios";
import { ADDR, STAKE, STAKE_KEY, koiosFetch, meta } from "./fixtures.ts";

test("watch input parsing", () => {
  assert.deepEqual(W.parseWatchInput(" $DeadHead "), { kind: "handle", value: "deadhead" });
  assert.equal(W.parseWatchInput(STAKE)?.kind, "stake");
  assert.equal(W.parseWatchInput(ADDR)?.kind, "address");
  assert.equal(W.parseWatchInput("hello"), null);
  assert.equal(W.parseWatchInput("$way_too_long_handle_name"), null);
});

test("skull names round-trip", () => {
  assert.equal(W.skullNameHex(2498), "546865576f726b696e674465616432343938"); // from the real #2498 on-chain
  assert.equal(W.skullNumber("546865576f726b696e674465616432343938"), 2498);
  assert.equal(W.skullNumber(W.toHex("SomethingElse1")), null);
});

test("image normalisation handles every CIP-25 shape", () => {
  assert.equal(W.normalizeImage("ipfs://QmAbc"), "QmAbc");
  assert.equal(W.normalizeImage("ipfs://ipfs/QmAbc"), "QmAbc");
  assert.equal(W.normalizeImage(["ipfs://bafy", "xyz"]), "bafyxyz");
  assert.equal(W.normalizeImage("https://x.io/a.png"), "https://x.io/a.png");
  assert.equal(W.normalizeImage("data:nope"), null);
  assert.equal(W.gatewayUrls("QmAbc").length, W.IPFS_GATEWAYS.length);
});

test("skull metadata → traits (nested flattened, boilerplate skipped)", () => {
  const s = W.skullFromAssetInfo({ policy_id: W.SKULL_POLICY, asset_name: W.skullNameHex(7), minting_tx_metadata: meta(7) });
  assert.equal(s.number, 7);
  assert.equal(s.name, "The Working Dead #7");
  assert.match(s.image!, /^QmSkull7/);
  const t = Object.fromEntries(s.traits);
  assert.equal(t["Background"], "Grave Moss");
  assert.equal(t["Job · Tool"], "Shovel");
  assert.ok(!("mediaType" in t) && !("name" in t));
});

test("summarize picks out skulls (sorted, deduped) and $WORK", () => {
  const h = W.summarize([
    { policy_id: W.SKULL_POLICY, asset_name: W.skullNameHex(50), quantity: "1" },
    { policy_id: W.SKULL_POLICY, asset_name: W.skullNameHex(3), quantity: "1" },
    { policy_id: W.SKULL_POLICY, asset_name: W.skullNameHex(9), quantity: "0" },
    { policy_id: W.WORK_POLICY, asset_name: W.WORK_NAME_HEX, quantity: "100" },
    { policy_id: W.WORK_POLICY, asset_name: W.WORK_NAME_HEX, quantity: "23" },
    { policy_id: W.WORK_POLICY, asset_name: "00", quantity: "5" },
  ]);
  assert.deepEqual(h.skulls.map((u) => W.skullNumber(u.slice(56))), [3, 50]);
  assert.equal(h.work, 123n);
  assert.equal(h.otherAssets, 1);
});

test("koios: $handle (CIP-68) → wallet → holdings → skull metadata", async () => {
  const log: string[] = [];
  const k = new KoiosClient("Mainnet", koiosFetch(log));
  const r = await k.resolve({ kind: "handle", value: "deadhead" });
  assert.equal(r.stake, STAKE);
  assert.equal(r.label, "$deadhead");
  const { rows, lovelace } = await k.holdings(r.addresses, r.stake);
  assert.equal(lovelace, 42_000_000n);
  const h = W.summarize(rows);
  assert.equal(h.work, 68085n);
  const skulls = await k.skulls(h.skulls);
  assert.deepEqual(skulls.map((s) => s.number), [131, 1311, 1334, 2498]);
  assert.ok(log.includes("/account_assets"), "uses the stake address so every wallet address is covered");
});

test("koios: plain address resolves its stake key; unknown handle errors", async () => {
  const k = new KoiosClient("Mainnet", koiosFetch());
  assert.equal((await k.resolve({ kind: "address", value: ADDR })).stake, STAKE);
  await assert.rejects(k.resolve({ kind: "handle", value: "nobody" }), /not found/);
  await assert.rejects(new KoiosClient("Preview", koiosFetch()).resolve({ kind: "handle", value: "x" }), /Mainnet/);
});

test("rescue scan: finds the Anvil vault (rebuilt from its lock message) and the open order", async () => {
  const { scanWallet } = await import("../../app/src/rescue.ts");
  const found = await scanWallet(new KoiosClient("Mainnet", koiosFetch()), STAKE, [ADDR]);
  assert.equal(found.length, 2, "the plain wallet utxo is not reported");
  const [vault, order] = found;
  assert.equal(vault.kind, "anvil-vault");
  assert.deepEqual(vault.skulls, [1311, 1334]);
  assert.equal(vault.lock!.signKey, STAKE_KEY);
  assert.equal(new Date(vault.lock!.unlockMs).toISOString(), "2023-09-03T00:49:53.000Z");
  assert.equal(order.kind, "dex-order");
  assert.equal(order.work, 2500n);
});

test("CIP-158 link format", () => {
  assert.equal(W.cip158Link("https://a.io/hub/"), "web+cardano://browse/v1?uri=https%3A%2F%2Fa.io%2Fhub%2F");
});

test("bundled rescue registry: every vault script re-hashes to its address", async () => {
  const R = await import("@wd/shared/rescue");
  const reg = (await import("../../app/src/rescue-registry.json", { with: { type: "json" } })).default as Record<string, { native: any; unlockSlot: number }>;
  const entries = Object.entries(reg);
  assert.ok(entries.length > 500, `registry has ${entries.length} vaults`);
  for (const [hash, v] of entries) assert.equal(R.nativeHash(v.native), hash);
  assert.ok(reg["1a412e534a4c8395e6294d958690f0eceaa7a224e5b9109157a1ad78"], "includes a known mainnet vault");
});
