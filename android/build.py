#!/usr/bin/env python3
"""Build the Working Dead Hub Android app from the web build in app/dist.

  python3 android/build.py            -> android/dist/working-dead-hub-<ver>.apk (signed)

Steps: unpack the base Capacitor shell, swap in our web app, give it its own
package id / label / version / icons, align, sign (v1 + v2), then verify.
Needs: Python 3 with Pillow + cryptography, and a JDK (for jarsigner). No Android SDK.
The signing key lives in android/keystore/ (created on first run, never committed).
"""
import json, os, shutil, subprocess, sys, tempfile, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
T = os.path.join(HERE, "tools")
BASE = os.path.join(HERE, "base", "wax-hub-2.0.apk")
DIST_WEB = os.path.join(ROOT, "app", "dist")
OUT = os.path.join(HERE, "dist")
KEYS = os.environ.get("WD_KEYSTORE_DIR", os.path.join(HERE, "keystore"))

cfg = json.load(open(os.path.join(HERE, "version.json")))
ver = json.load(open(os.path.join(ROOT, "app", "package.json")))["version"]


def py(script, *args):
    subprocess.run([sys.executable, "-I", os.path.join(T, script), *args], check=True)


def main():
    assert os.path.isfile(os.path.join(DIST_WEB, "index.html")), "build the web app first: npm --workspace app run build"
    os.makedirs(OUT, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix="wdapk-")
    with zipfile.ZipFile(BASE) as z:
        z.extractall(tmp)

    # 1. web app
    pub = os.path.join(tmp, "assets", "public")
    keep = {f: open(os.path.join(pub, f), "rb").read() for f in ("cordova.js", "cordova_plugins.js")}
    shutil.rmtree(pub)
    shutil.copytree(DIST_WEB, pub)
    for f, b in keep.items():
        open(os.path.join(pub, f), "wb").write(b)

    # 2. Capacitor config: our id/name, no debugging, no mixed content, no Antelope wallet hosts
    capp = os.path.join(tmp, "assets", "capacitor.config.json")
    cap = json.load(open(capp))
    cap.update(appId=cfg["packageId"], appName=cfg["label"], backgroundColor="#0c0c0a")
    cap["server"] = {"androidScheme": "https"}
    cap["android"] = {"allowMixedContent": False, "backgroundColor": "#0c0c0a", "webContentsDebuggingEnabled": False}
    cap.setdefault("plugins", {})
    cap["plugins"]["SplashScreen"] = {"launchAutoHide": True, "backgroundColor": "#0c0c0a"}
    cap["plugins"]["StatusBar"] = {"style": "DARK", "backgroundColor": "#0c0c0a"}
    # native HTTP for fetch/XHR: no browser CORS rules, so keyless Koios works in the app
    cap["plugins"]["CapacitorHttp"] = {"enabled": True}
    json.dump(cap, open(capp, "w"), indent="\t")

    # 3. identity: package id, link schemes, label, version
    man, arsc = os.path.join(tmp, "AndroidManifest.xml"), os.path.join(tmp, "resources.arsc")
    py("apkpkg.py", man, arsc, "app.waxhub", cfg["packageId"], "app.waxhub.MainActivity",
       "swap:anchor=wdhub", "swap:esr=wdhub-sign")
    py("arsc.py", arsc, "WAX Hub", cfg["label"])
    py("axml.py", "patch", man, man, f"versionCode={cfg['versionCode']}", f"versionName={ver}")

    # 4. art
    py("brand.py", tmp, os.path.join(pub, "icon.png"))
    shutil.copy(os.path.join(pub, "icon.png"), os.path.join(pub, "favicon.png"))
    shutil.copy(os.path.join(pub, "icon.png"), os.path.join(OUT, "working-dead-hub-icon.png"))

    # 5. pack, align, sign
    unsigned = os.path.join(OUT, f"working-dead-hub-{ver}-unsigned.apk")
    final = os.path.join(OUT, f"working-dead-hub-{ver}.apk")
    py("zipalign.py", BASE, tmp, unsigned)
    py("apksign.py", "keygen", KEYS)
    py("apksign.py", "sign", KEYS, unsigned, final)
    os.remove(unsigned)
    shutil.rmtree(tmp)

    # 6. verify
    py("verify.py", final, cfg["packageId"], cfg["label"], ver, str(cfg["versionCode"]))
    print("\nAPK:", final)


if __name__ == "__main__":
    main()
