// Wallet access. Browser / wallet in-app browser: CIP-30 (window.cardano).
// Android app: no injected wallet, so we hand off to VESPR/Eternl via CIP-158.
import { Lucid, verifyData, getAddressDetails, fromText, type LucidEvolution } from "@lucid-evolution/lucid";
import { lucidProvider } from "./source.ts";
import type { Net } from "@wd/shared/wd";

export type WalletInfo = { id: string; name: string; icon: string };

const PREFERRED = ["vespr", "eternl", "lace", "typhoncip30", "nufi", "gerowallet", "yoroi", "begin"];

export function detectWallets(): WalletInfo[] {
  const c = (window as any).cardano ?? {};
  return Object.keys(c)
    .filter((k) => c[k] && typeof c[k].enable === "function" && c[k].name)
    .map((k) => ({ id: k, name: c[k].name, icon: c[k].icon }))
    .sort((a, b) => (PREFERRED.indexOf(a.id) + 99) % 99 - (PREFERRED.indexOf(b.id) + 99) % 99);
}

const NET_ID: Record<Net, number> = { Mainnet: 1, Preprod: 0, Preview: 0 };

export type Session = { lucid: LucidEvolution; wallet: string; address: string; stake: string | null; verified: boolean };

export async function connectWallet(id: string, net: Net): Promise<Session> {
  const api = await (window as any).cardano[id].enable();
  const nid = await api.getNetworkId();
  if (nid !== NET_ID[net]) throw new Error(`Wallet is on ${nid === 1 ? "Mainnet" : "a testnet"} — switch it to ${net} or change the network chip`);
  const lucid = await Lucid(lucidProvider(net), net);
  lucid.selectWallet.fromAPI(api);
  const address = await lucid.wallet().address();
  const stake = (await lucid.wallet().rewardAddress()) ?? null;
  return { lucid, wallet: id, address, stake, verified: false };
}

/** Sign-in: the wallet signs a one-off message (CIP-8). No transaction, no fee. */
export async function proveOwnership(s: Session): Promise<boolean> {
  const nonce = crypto.getRandomValues(new Uint32Array(2)).join("-");
  const text = `Working Dead Hub sign-in\n${new Date().toISOString()}\nnonce ${nonce}`;
  const payload = fromText(text);
  const signed = await s.lucid.wallet().signMessage(s.address, payload);
  const details = getAddressDetails(s.address);
  return verifyData(details.address.hex, details.paymentCredential!.hash, payload, signed);
}
