import type { Holdings, Net, Skull } from "@wd/shared/wd";
import type { KoiosClient } from "@wd/shared/koios";
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
  koios: KoiosClient;
  account: Account;
  session: Session | null; // null = watch-only
  confirm: (s: Summary) => void;
  toast: (msg: string) => void;
  refresh: () => void;
};
