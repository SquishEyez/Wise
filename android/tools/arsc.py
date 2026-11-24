# From Antelope Hub (https://github.com/SquishEyez/ANThub), MIT licence, (c) 2026 SquishEyez.
"""Rename strings in resources.arsc's global string pool (e.g. the app label).

usage: python3 arsc.py <resources.arsc> "<old>" "<new>" [...more old/new pairs]
Rebuilds the global string pool (UTF-8 or UTF-16, styles preserved) and fixes
the table chunk size; everything after the pool is copied unchanged.
"""
import struct, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from axml import read_pool  # same ResStringPool layout


def build_pool_with_styles(b, pool, strs):
    off, hsz = pool["off"], pool["hsz"]
    utf8 = pool["utf8"]
    data = bytearray()
    offs = []
    for s in strs:
        offs.append(len(data))
        if utf8:
            e = s.encode("utf-8")
            n = len(s)
            ln = lambda v: bytes([v]) if v < 0x80 else bytes([0x80 | (v >> 8), v & 0xFF])
            data += ln(n) + ln(len(e)) + e + b"\0"
        else:
            e = s.encode("utf-16le")
            n = len(s)
            data += (struct.pack("<H", n) if n < 0x8000 else struct.pack("<HH", 0x8000 | (n >> 16), n & 0xFFFF)) + e + b"\0\0"
    while len(data) % 4:
        data += b"\0"
    nstyles = pool["styles"]
    style_offs = b""
    style_data = b""
    if nstyles:
        so = off + hsz + 4 * pool["count"]
        style_offs = b[so: so + 4 * nstyles]
        style_data = b[off + pool["stystart"]: off + pool["size"]]
    sstart = hsz + 4 * len(strs) + len(style_offs)
    stystart = sstart + len(data) if nstyles else 0
    size = sstart + len(data) + len(style_data)
    hdr = struct.pack("<HHI", 0x0001, hsz, size) + struct.pack("<IIIII", len(strs), nstyles, pool["flags"], sstart, stystart)
    hdr += b"\0" * (hsz - len(hdr))
    return hdr + b"".join(struct.pack("<I", o) for o in offs) + bytes(style_offs) + bytes(data) + bytes(style_data)


def main(path, pairs):
    b = open(path, "rb").read()
    typ, hsz, size, npk = struct.unpack_from("<HHII", b, 0)
    assert typ == 0x0002, "not a resource table"
    pool = read_pool(b, hsz)
    strs = list(pool["strs"])
    changed = 0
    for old, new in pairs:
        for i, s in enumerate(strs):
            if s == old:
                strs[i] = new
                changed += 1
    newpool = build_pool_with_styles(b, pool, strs)
    rest = b[hsz + pool["size"]:]
    total = hsz + len(newpool) + len(rest)
    out = struct.pack("<HHII", 0x0002, hsz, total, npk) + newpool + rest
    open(path, "wb").write(out)
    print(f"arsc: {changed} string(s) renamed")


if __name__ == "__main__":
    args = sys.argv[2:]
    main(sys.argv[1], list(zip(args[0::2], args[1::2])))
