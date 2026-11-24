// Picks where chain data comes from. The website needs Blockfrost (Koios mainnet
// answers are blocked by browsers). The Android app reaches Koios natively, keyless.
import { Blockfrost, Koios, type Provider } from "@lucid-evolution/lucid";
import type { ChainData } from "@wd/shared/chain";
import { KoiosClient } from "@wd/shared/koios";
import { BlockfrostClient, blockfrostUrl } from "@wd/shared/blockfrost";
import { KOIOS, type Net } from "@wd/shared/wd";
import { IN_APP } from "./env.ts";

const env = import.meta.env as Record<string, string | undefined>;
const KEYS: Record<Net, string> = {
  Mainnet: env.VITE_BLOCKFROST_KEY?.trim() ?? "",
  Preprod: env.VITE_BLOCKFROST_KEY_PREPROD?.trim() ?? "",
  Preview: env.VITE_BLOCKFROST_KEY_PREVIEW?.trim() ?? "",
};

/** Blockfrost when this build has a key for the network; otherwise Koios. */
export const useBlockfrost = (net: Net) => !!KEYS[net];

export function chainFor(net: Net): ChainData {
  return useBlockfrost(net) ? new BlockfrostClient(net, KEYS[net]) : new KoiosClient(net);
}

export function lucidProvider(net: Net): Provider {
  return useBlockfrost(net) ? new Blockfrost(blockfrostUrl(net), KEYS[net]) : new Koios(KOIOS[net]);
}

/** In a normal browser without a Blockfrost key the hub can't read the chain. */
export const browserBlocked = (net: Net) => !IN_APP && !useBlockfrost(net);
