import type { Holdings, Net, Skull } from "@wd/shared/wd";
import type { ChainData } from "@wd/shared/chain";
import type { Session } from "./wallet.ts";
import type { Summary } from "./ui.tsx";

export type Account = {
  label: string;
  addresses: string[];
  stake: string | null;
  lovelace: bigint;
  holdings: Holdings;
  skulls: Skull[];
};

export type Ctx = {
  net: Net;
  chain: ChainData;
  account: Account;
  session: Session | null; // null = watch-only
  confirm: (s: Summary) => void;
  toast: (msg: string) => void;
  refresh: () => void;
  /** skull numbers sitting in contracts (from Rescue) — not spendable from the wallet */
  locked: Set<number>;
};
