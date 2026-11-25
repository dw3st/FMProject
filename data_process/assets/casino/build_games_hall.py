"""Games hall art (report f7f6f7c8, options A of the mocks): the oval race track, the eight race cars and the green felt
table. Vector layouts refined by FLUX img2img on the local ComfyUI; the cars are cut out by the layout mask.
Output: src/example_data/assets/casino/<name>-1.webp.

    python -I data_process/assets/casino/build_games_hall.py [track] [table] [cars] [--regen]

The track centre line must match the screen (RaceGame.tsx, TRACK): a stadium in a 1600 x 900 image, straights from
x 520 to 1080 at y 190 and 710, half circles of radius 260 around (520, 450) and (1080, 450), 180 px wide.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))
import comfy  # noqa: E402
import build_casino_symbols as bcs  # noqa: E402

OUT = ROOT / "src" / "example_data" / "assets" / "casino"
W, H = 1600, 900
CX0, CX1, CY, R, HALF = 520, 1080, 450, 260, 90
CARS = [(220, 50, 50), (245, 175, 35), (60, 120, 230), (50, 175, 95), (150, 85, 210), (245, 115, 35), (215, 220, 228), (45, 45, 52)]


def stadium(d, off, **kw):
    r = R + off
    d.rounded_rectangle([CX0 - r, CY - r, CX1 + r, CY + r], r, **kw)


def track():
    img = Image.new("RGB", (W, H), (70, 128, 60))
    d = ImageDraw.Draw(img)
    stadium(d, HALF + 14, fill=(200, 40, 40))  # kerb
    stadium(d, HALF + 6, fill=(236, 236, 236))
    stadium(d, HALF, fill=(54, 56, 62))
    stadium(d, -HALF, fill=(236, 236, 236))
    stadium(d, -HALF - 6, fill=(78, 138, 66))
    for k in range(-HALF + 44, HALF - 30, 45):  # lane dashes on the straights
        for x in range(CX0, CX1, 60):
            d.rectangle([x, CY - R - k - 1, x + 28, CY - R - k + 1], fill=(120, 122, 128))
            d.rectangle([x, CY + R + k - 1, x + 28, CY + R + k + 1], fill=(120, 122, 128))
    sx = (CX0 + CX1) // 2  # start / finish chequer on the top straight
    for i in range(12):
        for j in range(2):
            if (i + j) % 2 == 0:
                y0 = CY - R - HALF + i * 15
                d.rectangle([sx + j * 15, y0, sx + 15 + j * 15, y0 + 15], fill=(244, 244, 244))
    prompt = ("top-down aerial view of an empty oval asphalt race circuit, red and white kerbs, white edge lines, green "
              "grass infield with mowing stripes, painted mobile game art, "
              "soft shadows, clean, no cars, no text, no letters, no logos")
    painted = comfy.refine("gh-track", prompt, img, 9101, strength=0.64, steps=10, regen="--regen" in sys.argv)
    painted.save(OUT / "race-track-1.webp", quality=88)


def table():
    img = Image.new("RGB", (W, H), (22, 16, 12))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([30, 30, W - 30, H - 30], 420, fill=(98, 56, 28))
    d.rounded_rectangle([60, 60, W - 60, H - 60], 390, fill=(122, 72, 36))
    d.rounded_rectangle([110, 110, W - 110, H - 110], 340, fill=(28, 108, 66))
    d.rounded_rectangle([190, 190, W - 190, H - 190], 270, outline=(52, 140, 92), width=4)
    prompt = ("top-down view of an empty casino card table, smooth green felt surface with a faint printed inner line, "
              "thick polished dark wooden rail around it with a leather pad, warm overhead lighting with a soft "
              "vignette, painted mobile game art, no cards, no chips, no text, no letters, no logos")
    painted = comfy.refine("gh-table", prompt, img, 9201, strength=0.45, steps=10, regen="--regen" in sys.argv)
    painted.save(OUT / "table-felt-1.webp", quality=88)


def tyre_boxes(w=360, h=176):
    ox, oy = (512 - w) // 2, (256 - h) // 2
    return [(wx, wy, wx + 56, wy + 40) for wx in (ox + 50, ox + w - 100) for wy in (oy, oy + h - 40)]


def car(color, w=360, h=176):
    """Top-down formula car pointing right."""
    c = bcs.Canvas(512, 256)
    ox, oy = (512 - w) // 2, (256 - h) // 2
    dark = tuple(max(0, v - 80) for v in color)
    tyre = (24, 24, 26)
    for wx in (ox + 50, ox + w - 100):
        for wy in (oy, oy + h - 40):
            c.shape(lambda dd, f, wx=wx, wy=wy: dd.rounded_rectangle([wx, wy, wx + 56, wy + 40], 12, fill=f), (60, 60, 64), tyre)
    c.shape(lambda dd, f: dd.rounded_rectangle([ox, oy + 30, ox + 34, oy + h - 30], 6, fill=f), color, dark, (20, 20, 24), 4)
    body = [(ox + 30, oy + 58), (ox + w - 70, oy + 66), (ox + w, oy + h // 2 - 12), (ox + w, oy + h // 2 + 12), (ox + w - 70, oy + h - 66), (ox + 30, oy + h - 58)]
    c.shape(lambda dd, f: dd.polygon(body, fill=f), tuple(min(255, v + 40) for v in color), dark, (20, 20, 24), 5)
    c.shape(lambda dd, f: dd.rounded_rectangle([ox + w - 30, oy + 34, ox + w - 6, oy + h - 34], 6, fill=f), color, dark, (20, 20, 24), 4)
    c.shape(lambda dd, f: dd.ellipse([ox + 150, oy + h // 2 - 26, ox + 220, oy + h // 2 + 26], fill=f), (70, 76, 92), (16, 18, 26))
    c.shape(lambda dd, f: dd.ellipse([ox + 168, oy + h // 2 - 15, ox + 196, oy + h // 2 + 15], fill=f), (250, 250, 250), (180, 180, 190))
    return c


def cars():
    names = sys.argv[1:]
    only = [int(a.split("=")[1]) for a in names if a.startswith("car=")]
    for i, col in enumerate(CARS, start=1):
        if only and i not in only:
            continue
        c = car(col)
        prompt = ("a single small open-wheel formula race car seen from directly above, nose pointing right, glossy "
                  "paint, black tyres, white driver helmet, premium mobile game art, soft studio lighting, crisp clean "
                  "edges, centered on a plain dark navy background, no number, no text, no letters, no logos")
        painted = comfy.refine(f"gh-car{i}", prompt, c.img, 9300 + i, strength=0.45, steps=10, regen="--regen" in sys.argv)
        out = bcs.cutout(painted, c.mask, keep_core=True)
        # The dark tyres sit close to the background colour and the cut-out loses them: paint them back, solid.
        tm = Image.new("L", out.size, 0)
        td = ImageDraw.Draw(tm)
        for b in tyre_boxes():
            td.rounded_rectangle(b, 12, fill=255)
            cx, top = (b[0] + b[2]) // 2, b[1] < 128
            ya, yb = (b[3], 128 - 22) if top else (128 + 22, b[1])
            td.line([cx - 14, ya, cx - 4, yb], fill=255, width=5)  # suspension arms
            td.line([cx + 14, ya, cx + 4, yb], fill=255, width=5)
        tyres = Image.new("RGBA", out.size, (26, 26, 30, 255))
        shine = ImageDraw.Draw(tyres)
        for x0, y0, x1, y1 in tyre_boxes():
            for k in range(x0 + 8, x1 - 6, 10):
                shine.line([k, y0 + 4, k, y1 - 4], fill=(48, 48, 54, 255), width=3)
        out = Image.composite(tyres, out, tm.filter(ImageFilter.GaussianBlur(0.8)))
        out = out.resize((256, 128), Image.LANCZOS)
        out.save(OUT / f"car-{i}-1.webp", quality=90)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--") and "=" not in a]
    todo = args or ["track", "table", "cars"]
    if "track" in todo:
        track()
    if "table" in todo:
        table()
    if "cars" in todo or any(a.startswith("car=") for a in sys.argv[1:]):
        cars()


if __name__ == "__main__":
    main()
