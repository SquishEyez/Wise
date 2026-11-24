// Minimal bech32 + Shelley address header decoding (CIP-19). No dependencies.
const CH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
export function bech32Bytes(s) {
  const p = s.lastIndexOf("1");
  const data = [...s.slice(p + 1, -6)].map((c) => CH.indexOf(c));
  let acc = 0, bits = 0; const out = [];
  for (const v of data) { acc = (acc << 5) | v; bits += 5; while (bits >= 8) { bits -= 8; out.push((acc >> bits) & 0xff); } }
  return Uint8Array.from(out);
}
const hex = (b) => Buffer.from(b).toString("hex");
/** { type, paymentScript, payment, stake } — hashes as hex. Byron/unknown → null. */
export function decode(addr) {
  if (!addr?.startsWith("addr")) return null;
  const b = bech32Bytes(addr);
  const type = b[0] >> 4;
  if (type > 7) return null;
  return {
    type,
    paymentScript: [1, 3, 5, 7].includes(type),
    payment: hex(b.slice(1, 29)),
    stakeScript: [2, 3].includes(type),
    stake: type <= 3 ? hex(b.slice(29, 57)) : null,
  };
}
