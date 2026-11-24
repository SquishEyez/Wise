"""Give the shell its own Android identity, so it installs beside (not over) Antelope Hub.

usage: python3 apkpkg.py <AndroidManifest.xml> <resources.arsc> <old.pkg> <new.pkg> [keep ...] [swap:a=b ...]

Manifest: every string-pool entry equal to <old> or starting with "<old>." becomes
<new>/<new>.…, except those listed in [keep] (Java class names such as
old.pkg.MainActivity must stay, they name real classes in classes.dex).
swap:a=b replaces an exact manifest string (used to drop the base shell's
anchor:// and esr:// link handlers, which belong to Antelope wallets).
resources.arsc: the package chunk's name is set to <new> so runtime lookups by
getPackageName() resolve.
"""
import struct, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from axml import read_pool, build_pool


def rename_manifest(path, old, new, keep, swaps=None):
    b = open(path, "rb").read()
    pool = read_pool(b, 8)
    strs = list(pool["strs"])
    changed = []
    for i, s in enumerate(strs):
        if swaps and s in swaps:
            strs[i] = swaps[s]
            changed.append(f"{s} -> {strs[i]}")
            continue
        if s in keep:
            continue
        if s == old or s.startswith(old + "."):
            strs[i] = new + s[len(old):]
            changed.append(f"{s} -> {strs[i]}")
    newpool = build_pool(pool, strs)
    rest = b[8 + pool["size"]:]
    open(path, "wb").write(struct.pack("<HHI", 0x0003, 8, 8 + len(newpool) + len(rest)) + newpool + rest)
    return changed


def rename_arsc_package(path, old, new):
    b = bytearray(open(path, "rb").read())
    typ, hsz, size, npk = struct.unpack_from("<HHII", b, 0)
    assert typ == 0x0002, "not a resource table"
    o = hsz
    found = 0
    while o < len(b):
        ctyp, chsz, csize = struct.unpack_from("<HHI", b, o)
        if ctyp == 0x0200:  # RES_TABLE_PACKAGE_TYPE: id(u32) then name[128] UTF-16
            name = b[o + 12:o + 12 + 256].decode("utf-16le").split("\0")[0]
            if name == old:
                assert len(new) < 128
                b[o + 12:o + 12 + 256] = new.encode("utf-16le").ljust(256, b"\0")
                found += 1
        o += csize
    open(path, "wb").write(bytes(b))
    return found


if __name__ == "__main__":
    man, arsc, old, new, *rest = sys.argv[1:]
    keep = {a for a in rest if not a.startswith("swap:")}
    swaps = dict(a[5:].split("=", 1) for a in rest if a.startswith("swap:"))
    for line in rename_manifest(man, old, new, keep, swaps):
        print("manifest:", line)
    n = rename_arsc_package(arsc, old, new)
    assert n == 1, f"expected one '{old}' package in resources.arsc, found {n}"
    print(f"arsc: package {old} -> {new}")
