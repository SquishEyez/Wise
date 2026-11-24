"""Repack an extracted APK tree, keeping the base APK's entry order and compression,
with every STORED entry's data aligned to 4 bytes (what zipalign -p 4 does; Android
requires it for resources.arsc on API 30+). New files are appended deflated.

usage: python3 zipalign.py <base.apk> <tree-dir> <out.apk>
"""
import os, sys, zipfile, struct

SIG = (".SF", ".RSA", ".DSA", ".EC")
FIXED_DT = (2026, 1, 1, 0, 0, 0)


def is_sig(name):
    return name.startswith("META-INF/") and (name.endswith(SIG) or name == "META-INF/MANIFEST.MF")


def write(zout, name, data, method):
    zi = zipfile.ZipInfo(name, date_time=FIXED_DT)
    zi.compress_type = method
    zi.external_attr = 0o644 << 16
    if method == zipfile.ZIP_STORED:
        # local header = 30 bytes + name + extra; pad extra so the data starts on a 4-byte boundary
        start = zout.fp.tell() + 30 + len(name.encode())
        pad = (-(start + 4)) % 4  # +4 for the extra-field header itself
        zi.extra = struct.pack("<HH", 0xD935, pad) + b"\0" * pad  # 0xD935 = Android alignment extra id
    zout.writestr(zi, data)


def main(src, tree, out):
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(out, "w") as zout:
        seen = set()
        for info in zin.infolist():
            n = info.filename
            p = os.path.join(tree, n)
            if n.endswith("/") or is_sig(n) or not os.path.isfile(p):
                continue
            write(zout, n, open(p, "rb").read(), info.compress_type)
            seen.add(n)
        for root, _, files in sorted(os.walk(tree)):
            for fn in sorted(files):
                p = os.path.join(root, fn)
                n = os.path.relpath(p, tree).replace(os.sep, "/")
                if n in seen or is_sig(n):
                    continue
                write(zout, n, open(p, "rb").read(), zipfile.ZIP_DEFLATED)
    # check
    with zipfile.ZipFile(out) as z, open(out, "rb") as f:
        for i in z.infolist():
            if i.compress_type == zipfile.ZIP_STORED:
                f.seek(i.header_offset + 26)
                nl, el = struct.unpack("<HH", f.read(4))
                assert (i.header_offset + 30 + nl + el) % 4 == 0, f"misaligned {i.filename}"
    print("wrote", out)


def realign(src, out):
    """Copy every entry (signature files included) unchanged, only fixing alignment."""
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(out, "w") as zout:
        for info in zin.infolist():
            if info.filename.endswith("/"):
                continue
            write(zout, info.filename, zin.read(info), info.compress_type)
    print("realigned", out)


if __name__ == "__main__":
    if sys.argv[1] == "--realign":
        realign(sys.argv[2], sys.argv[3])
    else:
        main(*sys.argv[1:4])
