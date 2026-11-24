// Headless browser smoke test of the built hub (app/dist) with Koios mocked.
// Skips cleanly when no Chrome/Chromium is installed.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { koiosFetch, epochParams } from "./fixtures.ts";
import { Emulator, generateEmulatorAccount, getAddressDetails, Lucid } from "@lucid-evolution/lucid";

const CHROME = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", process.env.CHROME_PATH ?? ""].find((p) => p && existsSync(p));
if (!CHROME) { console.log("ui-smoke: no Chrome found, skipped"); process.exit(0); }

const DIST = fileURLToPath(new URL("../../app/dist/", import.meta.url));
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".png": "image/png", ".json": "application/json" };
const server = createServer(async (req, res) => {
  const p = join(DIST, decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/\/$/, "/index.html"));
  let body: Buffer;
  try { body = await readFile(p); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(p)] ?? "application/octet-stream" });
  res.end(body);
}).listen(4317);

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==", "base64");
const fake = koiosFetch();
const fails: string[] = [];
const ok = (cond: unknown, msg: string) => { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fails.push(msg); };

const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
async function page(opts: { capacitor?: boolean; wallet?: boolean } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 } });
  const pg = await ctx.newPage();
  const errors: string[] = [];
  pg.on("pageerror", (e) => errors.push(String(e)));
  if (opts.capacitor) await pg.addInitScript("window.Capacitor = { isNativePlatform: function () { return true; } };");
  if (opts.wallet) await installFakeWallet(pg);
  const params = JSON.stringify(await epochParams());
  await pg.route(/koios\.rest/, async (route) => {
    const r = route.request();
    if (r.url().includes("/epoch_params")) return route.fulfill({ status: 200, body: params, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
    const res = await fake(r.url(), { method: r.method(), body: r.postData() ?? undefined });
    await route.fulfill({ status: res.status, body: await res.text(), headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
  });
  await pg.route(/\/ipfs\//, (route) => route.fulfill({ status: 200, body: PNG, contentType: "image/png" }));
  await pg.goto("http://localhost:4317/");
  return { pg, errors };
}

console.log("browser: watch a $handle");
{
  const { pg, errors } = await page();
  await pg.getByLabel("Address, stake address or $handle").fill("$deadhead");
  await pg.getByRole("button", { name: "Watch" }).click();
  await pg.getByText("watching (read-only)").waitFor({ timeout: 15000 });
  ok(await pg.getByText("$deadhead").isVisible(), "shows the handle");
  ok((await pg.locator(".stat-value").first().innerText()) === "4", "4 skulls counted (2 of them in a vault)");
  await pg.locator(".banner").waitFor({ timeout: 15000 });
  ok((await pg.locator(".banner").innerText()).includes("2 skulls"), "home shows the Rescue banner");
  ok(await pg.getByText("68,085").isVisible(), "$WORK balance");
  await pg.getByRole("button", { name: /Skulls/ }).first().click();
  ok((await pg.locator(".tile").count()) === 4, "skull grid has 4 tiles");
  ok((await pg.locator(".tile", { hasText: "🔒" }).count()) === 2, "vault skulls marked locked");
  await pg.locator(".tile").first().click();
  ok(await pg.getByText("Night Shift").isVisible(), "skull sheet shows nested traits");
  ok(!(await pg.getByRole("heading", { name: "Send" }).isVisible()), "no Send while only watching");
  await pg.screenshot({ path: "/tmp/hub-skull.png" });
  await pg.getByLabel("Close").click();
  await pg.getByLabel("Skull number").fill("131");
  await pg.getByRole("button", { name: "Look up" }).click();
  await pg.getByText("The Working Dead #131").first().waitFor();
  ok(await pg.getByText(/Held by addr1/).isVisible(), "lookup shows owner");
  await pg.getByLabel("Close").click();
  await pg.locator("nav.tabs").getByRole("button", { name: /Rescue/ }).click();
  await pg.getByText("Anvil staking vault").waitFor({ timeout: 15000 });
  ok(await pg.getByText("#1311 #1334").isVisible(), "rescue lists the vault's skulls");
  ok(await pg.getByText(/Unlocked since 03\/09\/2023/).isVisible(), "unlock time rebuilt from the lock message");
  ok(await pg.getByText("Minswap V2 order").isVisible(), "open Minswap order found");
  ok(await pg.getByText("Sign in with this wallet to recover it.").isVisible(), "watch mode can't recover");
  await pg.screenshot({ path: "/tmp/hub-rescue.png", fullPage: true });
  await pg.locator("nav.tabs").getByRole("button", { name: /Wisdom/ }).click();
  ok(await pg.getByRole("button", { name: /Browse courses/ }).isVisible(), "Wisdom tab links the courses");
  ok(await pg.getByText("68,085 $WORK").isVisible(), "Wisdom tab shows $WORK held");
  await pg.screenshot({ path: "/tmp/hub-wisdom.png" });
  await pg.locator("nav.tabs").getByRole("button", { name: /More/ }).click();
  ok(await pg.getByText(/jpg.store/).isVisible(), "official links listed");
  await pg.locator("nav.tabs").getByRole("button", { name: /Home/ }).click();
  await pg.screenshot({ path: "/tmp/hub-home.png" });
  ok(errors.length === 0, "no page errors " + errors.join(" | "));
}

console.log("browser: sign in with a (fake) CIP-30 wallet backed by a real key");
{
  const { pg, errors } = await page({ wallet: true });
  await pg.getByRole("button", { name: /FakeVespr/ }).click();
  try { await pg.getByText("✓ signed in").waitFor({ timeout: 20000 }); } catch (e) { console.log("TOASTS:", await pg.locator(".toasts").innerText(), "BODY:", (await pg.locator("main").innerText()).slice(0, 400), errors); throw e; }
  ok(true, "wallet signed the CIP-8 message and the hub verified it");
  await pg.locator("nav.tabs").getByRole("button", { name: /More/ }).click();
  await pg.getByRole("button", { name: "Bury" }).click();
  ok(await pg.getByText("Bury in the crypt").isVisible(), "a transaction opens the summary sheet first");
  ok(await pg.getByRole("button", { name: "Approve in wallet" }).isVisible(), "…and waits for approval");
  await pg.screenshot({ path: "/tmp/hub-confirm.png" });
  ok(errors.length === 0, "no page errors " + errors.join(" | "));
}

console.log("browser: Android app mode (no injected wallet)");
{
  const { pg, errors } = await page({ capacitor: true });
  await pg.getByText("Sign in").first().waitFor();
  const handoff = pg.getByRole("button", { name: "Open in VESPR / Eternl" });
  const noUrl = pg.getByText(/no hub address set/);
  ok((await handoff.isVisible()) || (await noUrl.isVisible()), "offers wallet hand-off (or explains it's unset)");
  if (process.env.EXPECT_HUB_URL) ok(await handoff.isVisible(), "hand-off button enabled (hub address is set)");
  await pg.screenshot({ path: "/tmp/hub-connect-app.png" });
  ok(errors.length === 0, "no page errors " + errors.join(" | "));
}

await browser.close();
server.close();
if (fails.length) { console.error(`ui-smoke: ${fails.length} failed`); process.exit(1); }
console.log("ui-smoke: all passed");

async function installFakeWallet(pg: import("playwright-core").Page) {
  const acc = generateEmulatorAccount({ lovelace: 50_000_000n });
  const lucid = await Lucid(new Emulator([acc]), "Custom");
  lucid.selectWallet.fromSeed(acc.seedPhrase);
  const addrHex = getAddressDetails(acc.address).address.hex;
  const reward = await lucid.wallet().rewardAddress();
  const rewardHex = reward ? getAddressDetails(reward).address.hex : null;
  await pg.exposeFunction("wdFakeSign", async (_addr: string, payload: string) => lucid.wallet().signMessage(acc.address, payload));
  await pg.addInitScript(`
    window.cardano = { fakevespr: { name: "FakeVespr", icon: "", apiVersion: "1",
      isEnabled: async () => false,
      enable: async () => ({
        getNetworkId: async () => 0,
        getUsedAddresses: async () => ["${addrHex}"],
        getUnusedAddresses: async () => [],
        getChangeAddress: async () => "${addrHex}",
        getRewardAddresses: async () => ${rewardHex ? `["${rewardHex}"]` : "[]"},
        getUtxos: async () => [],
        getCollateral: async () => [],
        getBalance: async () => "00",
        signData: async (a, p) => window.wdFakeSign(a, p),
        signTx: async () => { throw new Error("not in smoke test"); },
        submitTx: async () => { throw new Error("not in smoke test"); },
        experimental: {},
      }) } };
    localStorage.setItem("wdhub:net", "Preview");
  `);
}
