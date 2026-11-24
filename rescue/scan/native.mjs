// Native (timelock) script CBOR + hash, per the Cardano ledger CDDL:
//   native_script = [0, keyhash] sig | [1, [scripts]] all | [2, [scripts]] any
//                 | [3, n, [scripts]] atLeast | [4, slot] after | [5, slot] before
//   script hash   = blake2b-224( 0x00 || cbor(native_script) )
import { blake2b } from "@noble/hashes/blake2b";

function head(major, n) {
  const m = major << 5;
  if (n < 24) return [m | n];
  if (n < 256) return [m | 24, n];
  if (n < 65536) return [m | 25, n >> 8, n & 255];
  if (n < 2 ** 32) return [m | 26, (n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
  const hi = Math.floor(n / 2 ** 32), lo = n >>> 0;
  return [m | 27, (hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255];
}
const uint = (n) => head(0, n);
const bytes = (hex) => [...head(2, hex.length / 2), ...Buffer.from(hex, "hex")];
const arr = (items) => [...head(4, items.length), ...items.flat()];

export function nativeCbor(s) {
  switch (s.type) {
    case "sig": return arr([uint(0), bytes(s.keyHash)]);
    case "all": return arr([uint(1), arr(s.scripts.map(nativeCbor))]);
    case "any": return arr([uint(2), arr(s.scripts.map(nativeCbor))]);
    case "atLeast": return arr([uint(3), uint(s.required), arr(s.scripts.map(nativeCbor))]);
    case "after": return arr([uint(4), uint(Number(s.slot))]);
    case "before": return arr([uint(5), uint(Number(s.slot))]);
    default: throw new Error("unknown native script type " + s.type);
  }
}
export const nativeCborHex = (s) => Buffer.from(nativeCbor(s)).toString("hex");
export const nativeHash = (s) => Buffer.from(blake2b(Uint8Array.from([0, ...nativeCbor(s)]), { dkLen: 28 })).toString("hex");

/** Anvil staking lock: all[ after(slot), sig(key) ] */
export const anvilLock = (keyHash, slot) => ({ type: "all", scripts: [{ type: "after", slot }, { type: "sig", keyHash }] });

// Shelley mainnet time <-> slot
export const SHELLEY_SLOT = 4492800, SHELLEY_UNIX = 1596059091;
export const slotToUnix = (slot) => SHELLEY_UNIX + (slot - SHELLEY_SLOT);
export const unixToSlot = (t) => SHELLEY_SLOT + (t - SHELLEY_UNIX);
