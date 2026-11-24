"""Working Dead Hub branding, drawn procedurally (no image assets): a bone skull on a
grave-dark tile with a rot-green ring. Redraws the base shell's launcher icons,
adaptive foreground, splash screens, and writes the web icon.

usage: python3 brand.py <extracted-apk-dir> <web-icon-out.png>
       python3 brand.py --icon <out.png>        (just the 512px web icon)
"""
import os, sys
from PIL import Image, ImageDraw

BG = (12, 12, 10)
TILE = (21, 21, 18)
BONE = (236, 227, 201)
BONE_SH = (190, 178, 148)
ROT = (143, 209, 79)
INK = (8, 8, 6)

# launcher icon files in the base shell (same list Antelope Hub's brand.py uses)
LEGACY = ["9w.png", "yn.png", "FS.png", "RJ.png", "o-.png"]
ROUND = ["zR.png", "8c.png", "wb.png", "fO.png", "Gc.png"]
FOREGROUND = ["QZ.png", "zr.png", "Em.png", "Lf.png", "as.png"]


def skull(d):
    """d x d RGBA skull, drawn at 4x and downsampled."""
    s = d * 4
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    g = ImageDraw.Draw(im)
    cx = s / 2
    # cranium + cheeks
    g.ellipse([s * 0.14, s * 0.06, s * 0.86, s * 0.70], fill=BONE)
    g.rounded_rectangle([s * 0.24, s * 0.42, s * 0.76, s * 0.80], radius=s * 0.08, fill=BONE)
    # jaw
    g.rounded_rectangle([s * 0.31, s * 0.70, s * 0.69, s * 0.94], radius=s * 0.06, fill=BONE_SH)
    # eye sockets (glowing rot-green pupils)
    for ex in (0.355, 0.645):
        g.ellipse([s * (ex - 0.12), s * 0.36, s * (ex + 0.12), s * 0.58], fill=INK)
        g.ellipse([s * (ex - 0.035), s * 0.45, s * (ex + 0.035), s * 0.52], fill=ROT)
    # nose
    g.polygon([(cx, s * 0.58), (cx - s * 0.055, s * 0.69), (cx + s * 0.055, s * 0.69)], fill=INK)
    # teeth
    for i in range(5):
        x = s * (0.355 + i * 0.0725)
        g.rectangle([x, s * 0.76, x + s * 0.012, s * 0.90], fill=INK)
    g.rectangle([s * 0.33, s * 0.825, s * 0.67, s * 0.84], fill=INK)
    # crack
    g.line([(s * 0.62, s * 0.08), (s * 0.58, s * 0.18), (s * 0.63, s * 0.24), (s * 0.60, s * 0.31)], fill=INK, width=max(2, int(s * 0.014)))
    return im.resize((d, d), Image.LANCZOS)


def emblem(n, shape):
    """Tile + ring + skull. shape: 'square' (rounded), 'circle', or 'full' (adaptive layer)."""
    s = n * 4
    im = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    g = ImageDraw.Draw(im)
    if shape == "square":
        g.rounded_rectangle([0, 0, s - 1, s - 1], radius=s * 0.22, fill=TILE)
    elif shape == "circle":
        g.ellipse([0, 0, s - 1, s - 1], fill=TILE)
    else:
        g.rectangle([0, 0, s, s], fill=TILE)
    r = s * (0.40 if shape != "full" else 0.27)  # adaptive icons are cropped to the middle 66%
    g.ellipse([s / 2 - r, s / 2 - r, s / 2 + r, s / 2 + r], outline=ROT, width=int(s * 0.025))
    sk = skull(int(r * 1.45))
    im.alpha_composite(sk, (int(s / 2 - sk.width / 2), int(s / 2 - sk.height / 2 + r * 0.04)))
    return im.resize((n, n), Image.LANCZOS)


def splash(w, h):
    im = Image.new("RGBA", (w, h), BG + (255,))
    d = int(min(w, h) * 0.34)
    e = emblem(d, "circle")
    im.alpha_composite(e, ((w - d) // 2, (h - d) // 2))
    return im


def is_splash(path):
    im = Image.open(path)
    if im.width < 300 or im.height < 300 or os.path.basename(path) in FOREGROUND:
        return False
    c = im.convert("RGB").getpixel((im.width // 2, im.height // 2))
    return c[0] > 200 and 120 < c[1] < 200 and c[2] < 90  # the base shell's orange coin


def main(tree, web_icon):
    res = os.path.join(tree, "res")
    for f in LEGACY:
        p = os.path.join(res, f); n = Image.open(p).width
        emblem(n, "square").save(p)
    for f in ROUND:
        p = os.path.join(res, f); n = Image.open(p).width
        emblem(n, "circle").save(p)
    for f in FOREGROUND:
        p = os.path.join(res, f); n = Image.open(p).width
        emblem(n, "full").save(p)
    n_splash = 0
    for f in sorted(os.listdir(res)):
        p = os.path.join(res, f)
        if f.endswith(".png") and is_splash(p):
            w, h = Image.open(p).size
            splash(w, h).convert("RGB").save(p)
            n_splash += 1
    emblem(512, "square").save(web_icon)
    print(f"brand: 15 launcher icons, {n_splash} splash screens, web icon")
    return n_splash


if __name__ == "__main__":
    if sys.argv[1] == "--icon":
        os.makedirs(os.path.dirname(os.path.abspath(sys.argv[2])), exist_ok=True)
        emblem(512, "square").save(sys.argv[2])
    else:
        main(sys.argv[1], sys.argv[2])
