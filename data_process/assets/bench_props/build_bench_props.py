"""Bench-side props (tester report: drink coolers by the bench): vector layouts refined by FLUX img2img, cut out by the
layout mask. Output: painted/<name>.png (RGBA, 768 px) for the mock; the game sizes them down."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import comfy

S = 768
HERE = Path(__file__).resolve().parent
(HERE / "painted").mkdir(exist_ok=True)
GRASS = (36, 96, 54)


def base():
    return Image.new("RGB", (S, S), GRASS)


def shadow(img, shape_fn, dx=40, dy=50, blur=22):
    sh = Image.new("L", (S, S), 0)
    shape_fn(ImageDraw.Draw(sh), dx, dy)
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(img, np.float32)
    m = np.asarray(sh, np.float32)[..., None] / 255 * 0.55
    return Image.fromarray((a * (1 - m) + np.array([12, 40, 22]) * m).astype(np.uint8))


def radial(img, cx, cy, r, inner, outer):
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    d = np.clip(np.hypot(xx - cx + r * 0.3, yy - cy + r * 0.3) / (r * 1.5), 0, 1)[..., None]
    col = np.array(inner, np.float32) * (1 - d) + np.array(outer, np.float32) * d
    m = (np.hypot(xx - cx, yy - cy) <= r)[..., None]
    a = np.asarray(img, np.float32)
    return Image.fromarray(np.where(m, col, a).astype(np.uint8))


def jug():
    c, r = S / 2, 230
    img = shadow(base(), lambda d, dx, dy: d.ellipse([c - r + dx, c - r + dy, c + r + dx, c + r + dy], fill=255))
    img = radial(img, c, c, r, (255, 160, 60), (200, 90, 20))
    img = radial(img, c, c, 150, (235, 235, 238), (170, 170, 178))
    d = ImageDraw.Draw(img)
    d.ellipse([c - 230, c - 230, c + 230, c + 230], outline=(120, 55, 10), width=8)
    d.ellipse([c - 150, c - 150, c + 150, c + 150], outline=(90, 90, 96), width=6)
    d.rounded_rectangle([c - 40, c - 120, c + 40, c - 70], 14, fill=(60, 60, 66))
    d.rectangle([c - 110, c - 12, c + 110, c + 12], fill=(200, 200, 206))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).ellipse([c - r, c - r, c + r, c + r], fill=255)
    return img, mask, ("Top-down view of an orange round sports drink cooler jug standing on a football pitch touchline, "
        "seen from directly above: round white lid with a grey carry handle, glossy orange plastic body rim, soft shadow on the "
        "short green grass, clean stylised video game art, crisp edges, no text, no logos.")


def crate():
    x0, y0, x1, y1 = 144, 214, 624, 554
    img = shadow(base(), lambda d, dx, dy: d.rectangle([x0 + dx, y0 + dy, x1 + dx, y1 + dy], fill=255))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x1, y1], 26, fill=(40, 52, 64), outline=(18, 24, 30), width=8)
    for i in range(4):
        for j in range(3):
            cx, cy = x0 + 70 + i * 113, y0 + 62 + j * 108
            d.ellipse([cx - 44, cy - 44, cx + 44, cy + 44], fill=(110, 180, 235), outline=(40, 90, 140), width=5)
            d.ellipse([cx - 20, cy - 20, cx + 20, cy + 20], fill=(240, 244, 248))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], 26, fill=255)
    return img, mask, ("Top-down view of a dark grey plastic crate full of twelve water bottles seen from above, white "
        "bottle caps on clear blue plastic bottles, on a football pitch, soft shadow on the short green grass, clean stylised "
        "video game art, crisp edges, no text, no logos.")


def box():
    x0, y0, x1, y1 = 124, 224, 644, 544
    img = shadow(base(), lambda d, dx, dy: d.rectangle([x0 + dx, y0 + dy, x1 + dx, y1 + dy], fill=255))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x1, y1], 40, fill=(236, 240, 244), outline=(150, 160, 170), width=8)
    d.rounded_rectangle([x0, y0, x1, y0 + 90], 40, fill=(32, 104, 200))
    d.rectangle([x0, y0 + 50, x1, y0 + 90], fill=(32, 104, 200))
    d.rounded_rectangle([x0 + 180, y0 + 170, x1 - 180, y0 + 220], 20, fill=(150, 160, 172))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], 40, fill=255)
    return img, mask, ("Top-down view of a white portable ice chest cooler box with a blue lid edge and a grey handle, seen "
        "from directly above on a football pitch, soft shadow on the short green grass, clean stylised video game art, crisp "
        "edges, no text, no logos.")


def bottle():
    x0, y0, x1, y1 = 284, 104, 484, 664
    img = shadow(base(), lambda d, dx, dy: d.rounded_rectangle([x0 + dx, y0 + dy, x1 + dx, y1 + dy], 90, fill=255), 30, 30, 16)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0 + 60, x1, y1], 90, fill=(120, 190, 240), outline=(40, 90, 140), width=6)
    d.rounded_rectangle([x0 + 50, y0, x1 - 50, y0 + 90], 20, fill=(240, 244, 248), outline=(120, 130, 140), width=5)
    d.rectangle([x0 + 20, y0 + 260, x1 - 20, y0 + 380], fill=(30, 110, 205))
    d.rectangle([x0 + 50, y0 + 140, x0 + 80, y1 - 60], fill=(200, 230, 252))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], 90, fill=255)
    return img, mask, ("Top-down view of a single plastic sports water bottle lying on short green grass, clear blue plastic "
        "with a white squeeze cap and a plain blue band, glossy highlight, soft shadow, clean stylised video game art, crisp "
        "edges, no text, no logos.")


def table():
    x0, y0, x1, y1 = 74, 214, 694, 554
    img = shadow(base(), lambda d, dx, dy: d.rectangle([x0 + dx, y0 + dy, x1 + dx, y1 + dy], fill=255))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x1, y1], 18, fill=(150, 156, 164), outline=(70, 76, 84), width=8)
    for i in range(5):
        cx, cy = x0 + 80 + i * 92, y0 + 110
        d.ellipse([cx - 36, cy - 36, cx + 36, cy + 36], fill=(110, 180, 235), outline=(40, 90, 140), width=5)
        d.ellipse([cx - 16, cy - 16, cx + 16, cy + 16], fill=(240, 244, 248))
    for i in range(5):
        cx, cy = x0 + 120 + i * 92, y0 + 240
        d.ellipse([cx - 30, cy - 30, cx + 30, cy + 30], fill=(250, 250, 252), outline=(170, 175, 182), width=5)
        d.ellipse([cx - 18, cy - 18, cx + 18, cy + 18], fill=(210, 230, 245))
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], 18, fill=255)
    return img, mask, ("Top-down view of a small grey folding table seen from directly above on a football pitch, a row of "
        "clear blue water bottles with white caps and a row of white paper cups with water, soft shadow on the short green "
        "grass, clean stylised video game art, crisp edges, no text, no logos.")


SEEDS = {"crate": 23}
only = set(sys.argv[1:])
for name, fn, strength in [("jug", jug, 0.6), ("crate", crate, 0.45), ("box", box, 0.6), ("bottle", bottle, 0.55),
                           ("table", table, 0.55)]:
    if only and name not in only:
        continue
    lay, mask, prompt = fn()
    lay.save(HERE / f"{name}-layout.png")
    out = comfy.refine(f"bench-{name}", prompt, lay, SEEDS.get(name, 7), strength)
    out.save(HERE / f"{name}-flux.png")
    m = np.asarray(mask.filter(ImageFilter.GaussianBlur(2)), np.float32)
    rgb = np.asarray(out.convert("RGB"), np.float32)
    Image.fromarray(np.dstack([rgb, m]).astype(np.uint8), "RGBA").save(HERE / "painted" / f"{name}.png")
    print(name, "ok")
