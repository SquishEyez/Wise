"""Independent checks on the finished APK (androguard + apksigtool), so a broken
package never reaches a phone.

usage: python3 verify.py <apk> <packageId> <label> <versionName> <versionCode>
"""
import json, struct, subprocess, sys, zipfile, logging

apk, pkg, label, vname, vcode = sys.argv[1:6]
fails = []
def check(ok, msg):
    print(("  ✓ " if ok else "  ✗ ") + msg)
    if not ok: fails.append(msg)

from loguru import logger  # androguard logs through loguru
logger.remove()
from androguard.core.apk import APK
a = APK(apk)
check(a.get_package() == pkg, f"package id {a.get_package()}")
check(a.get_app_name() == label, f"label '{a.get_app_name()}'")
check(a.get_androidversion_name() == vname and str(a.get_androidversion_code()) == vcode, f"version {a.get_androidversion_name()} ({a.get_androidversion_code()})")
check(int(a.get_min_sdk_version()) == 23 and int(a.get_target_sdk_version()) == 35, f"min/target SDK {a.get_min_sdk_version()}/{a.get_target_sdk_version()}")
check(a.get_main_activity() == "app.waxhub.MainActivity", f"launcher activity {a.get_main_activity()}")
man = a.get_android_manifest_axml().get_xml().decode()
check("app.waxhub\"" not in man and "app.waxhub." not in man.replace("app.waxhub.MainActivity", ""), "no leftover app.waxhub ids (except the activity class)")
check("\"anchor\"" not in man and "\"esr\"" not in man, "doesn't claim anchor:// / esr:// links")
check(f"{pkg}.fileprovider" in man and f"{pkg}.androidx-startup" in man, "provider authorities renamed")
check(a.get_android_resources().get_packages_names() == [pkg], f"resources package {a.get_android_resources().get_packages_names()}")
check(a.is_signed_v1() and a.is_signed_v2(), "signed v1 + v2")

with zipfile.ZipFile(apk) as z:
    names = set(z.namelist())
    cap = json.loads(z.read("assets/capacitor.config.json"))
    check(cap["appId"] == pkg and cap["android"]["webContentsDebuggingEnabled"] is False, "capacitor config: our id, debugging off")
    check("assets/public/index.html" in names and any(n.endswith(".wasm") for n in names), "web app + wasm inside")
    html = z.read("assets/public/index.html").decode()
    check("Working Dead Hub" in html, "index.html is the hub")
    check(z.getinfo("resources.arsc").compress_type == zipfile.ZIP_STORED, "resources.arsc stored (uncompressed)")
    misaligned = []
    with open(apk, "rb") as f:
        for i in z.infolist():
            if i.compress_type == zipfile.ZIP_STORED:
                f.seek(i.header_offset + 26); nl, el = struct.unpack("<HH", f.read(4))
                if (i.header_offset + 30 + nl + el) % 4: misaligned.append(i.filename)
    check(not misaligned, f"stored entries 4-byte aligned {misaligned[:3]}")
    check(z.testzip() is None, "zip CRCs OK")

r = subprocess.run(["apksigtool", "verify", apk], capture_output=True, text=True)
check(r.returncode == 0, "apksigtool verify: " + (r.stdout.strip().splitlines() or [r.stderr.strip()])[-1][:120])

if fails:
    sys.exit(f"verify: {len(fails)} problem(s)")
print("verify: APK OK")
