"""Club screen art (4.41.21): the stadium seen from above (night, navy) behind the clickable stand map, and a plain
grass texture for the turf preview of an unmown pitch. Vector layout drawn from the SAME geometry as the stadium SVG
(`STAND_GEOM` in src/GameInterface/Facilities/FacilitiesView.tsx, viewBox 320x400), refined by FLUX.2 klein img2img.

Needs ComfyUI on http://127.0.0.1:8188 (see comfy.py). Output:
  src/example_data/assets/club/stadium-top.webp   (960x1200, viewBox x3)
  src/example_data/assets/club/grass-plain.webp   (1152x736)
"""
from __future__ import annotations

import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, r"C:\projects\FMProject\data_process\assets")
import comfy  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "example_data" / "assets" / "club"
DEBUG = Path(__file__).resolve().parent / "club_debug"

S = 3  # viewBox units -> px
VW, VH = 320, 400
SS = 2  # supersampling

# Same numbers as FacilitiesView.tsx (STAND_GEOM, bowl, pitch).
STANDS = {
    "north": (96, 14, 128, 54),
    "south": (96, 332, 128, 54),
    "west": (14, 80, 70, 240),
    "east": (236, 80, 70, 240),
}
BOWL = (6, 6, 314, 394, 38)
PITCH = (92, 76, 228, 324)

NAVY = (11, 15, 26)
CONCRETE = (40, 46, 62)
CONCRETE_LT = (66, 74, 94)
SEAT = (54, 78, 128)
SEAT_DK = (30, 42, 70)
ROOF = (150, 160, 178)
GRASS_A = (44, 108, 52)
GRASS_B = (38, 96, 46)
RUNOFF = (30, 76, 38)
WHITE = (232, 236, 238)


def u(v: float) -> int:
    return int(round(v * S * SS))


def stadium_layout() -> Image.Image:
    W, H = VW * S * SS, VH * S * SS
    im = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(im)
    x0, y0, x1, y1, r = BOWL
    d.rounded_rectangle([u(x0), u(y0), u(x1), u(y1)], radius=u(r), fill=CONCRETE)
    # inner concourse ring (slightly lighter) around the grass
    d.rounded_rectangle([u(80), u(64), u(240), u(336)], radius=u(10), fill=CONCRETE_LT)
    # grass with run-off
    d.rectangle([u(84), u(68), u(236), u(332)], fill=RUNOFF)
    px0, py0, px1, py1 = PITCH
    n = 12
    for i in range(n):
        ya = py0 + (py1 - py0) * i / n
        yb = py0 + (py1 - py0) * (i + 1) / n
        d.rectangle([u(px0), u(ya), u(px1), u(yb)], fill=GRASS_A if i % 2 == 0 else GRASS_B)
    lw = max(2, u(1.2))
    d.rectangle([u(px0), u(py0), u(px1), u(py1)], outline=WHITE, width=lw)
    d.line([u(px0), u(200), u(px1), u(200)], fill=WHITE, width=lw)
    d.ellipse([u(160 - 20), u(200 - 20), u(160 + 20), u(200 + 20)], outline=WHITE, width=lw)
    d.ellipse([u(158.6), u(198.6), u(161.4), u(201.4)], fill=WHITE)
    for top in (True, False):
        yb = py0 if top else py1
        sgn = 1 if top else -1
        d.rectangle(sorted_box(u(128), u(yb), u(192), u(yb + sgn * 30)), outline=WHITE, width=lw)
        d.rectangle(sorted_box(u(145), u(yb), u(175), u(yb + sgn * 11)), outline=WHITE, width=lw)
        d.rectangle(sorted_box(u(152), u(yb), u(168), u(yb - sgn * 3)), outline=WHITE, width=lw)  # goal
    # stands: seat rows parallel to the pitch, aisles, a roof edge on the outer side
    rnd = random.Random(7)
    for sid, (sx, sy, sw, sh) in STANDS.items():
        horiz = sw > sh
        d.rounded_rectangle([u(sx), u(sy), u(sx + sw), u(sy + sh)], radius=u(8), fill=SEAT_DK)
        depth = sh if horiz else sw
        rows = int(depth / 3.2)
        roof = 9
        for k in range(rows):
            t0 = 4 + k * (depth - roof - 6) / rows
            t1 = t0 + (depth - roof - 6) / rows * 0.62
            # inner side is the side touching the pitch
            if sid == "north":
                a, b = sy + sh - t1, sy + sh - t0
                box = (sx + 5, a, sx + sw - 5, b)
            elif sid == "south":
                box = (sx + 5, sy + t0, sx + sw - 5, sy + t1)
            elif sid == "west":
                box = (sx + sw - t1, sy + 5, sx + sw - t0, sy + sh - 5)
            else:
                box = (sx + t0, sy + 5, sx + t1, sy + sh - 5)
            shade = tuple(min(255, c + rnd.randint(-6, 10)) for c in SEAT)
            d.rectangle([u(box[0]), u(box[1]), u(box[2]), u(box[3])], fill=shade)
        # aisles (stairs) across the rows
        length = sw if horiz else sh
        step = 21
        for k in range(1, int(length / step)):
            if horiz:
                ax = sx + k * length / int(length / step)
                d.rectangle([u(ax - 1), u(sy + 2), u(ax + 1), u(sy + sh - 2)], fill=CONCRETE_LT)
            else:
                ay = sy + k * length / int(length / step)
                d.rectangle([u(sx + 2), u(ay - 1), u(sx + sw - 2), u(ay + 1)], fill=CONCRETE_LT)
        # roof edge (outer side)
        if sid == "north":
            rb = (sx, sy, sx + sw, sy + roof)
        elif sid == "south":
            rb = (sx, sy + sh - roof, sx + sw, sy + sh)
        elif sid == "west":
            rb = (sx, sy, sx + roof, sy + sh)
        else:
            rb = (sx + sw - roof, sy, sx + sw, sy + sh)
        d.rounded_rectangle([u(rb[0]), u(rb[1]), u(rb[2]), u(rb[3])], radius=u(4), fill=ROOF)
    # floodlight pylons on the corners of the bowl, with a warm glow
    glow = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(glow)
    for cx, cy in ((40, 40), (280, 40), (40, 360), (280, 360)):
        d.ellipse([u(cx - 6), u(cy - 6), u(cx + 6), u(cy + 6)], fill=(90, 96, 112))
        d.rectangle([u(cx - 4), u(cy - 2.5), u(cx + 4), u(cy + 2.5)], fill=(250, 240, 210))
        gd.ellipse([u(cx - 26), u(cy - 26), u(cx + 26), u(cy + 26)], fill=120)
    glow = glow.filter(ImageFilter.GaussianBlur(u(10)))
    a = np.asarray(im, np.float32)
    g = np.asarray(glow, np.float32)[..., None] / 255
    a = a * (1 - g) + np.array([255, 236, 190], np.float32) * g
    return Image.fromarray(a.astype(np.uint8)).resize((VW * S, VH * S), Image.LANCZOS)


def sorted_box(x0, y0, x1, y1):
    return [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]


STADIUM_PROMPT = (
    "Top-down aerial view straight down on a football stadium at night: four grandstands with tiered rows of navy blue "
    "seats and concrete stairways, a thin steel roof edge on the outer side of each stand, a floodlit green football "
    "pitch with mowed stripes and crisp white markings in the middle, a dark concrete concourse and four floodlight "
    "pylons glowing at the corners. Polished stylized digital illustration, clean shapes, soft night lighting, deep navy "
    "blue tones, detailed. No text, no letters, no logos, no people.")


def build_stadium(seed: int = 41):
    src = stadium_layout()
    painted = comfy.refine("club-stadium-top", STADIUM_PROMPT, src, seed, 0.7).resize(src.size, Image.LANCZOS)
    # keep a share of the layout so the stand edges stay exactly where the map's hit areas are
    out = np.asarray(painted, np.float32) * 0.85 + np.asarray(src, np.float32) * 0.15
    img = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / "stadium-top.webp", quality=86, method=6)
    DEBUG.mkdir(exist_ok=True)
    src.save(DEBUG / "stadium-layout.png")
    painted.save(DEBUG / "stadium-painted.png")


GRASS_PROMPT = (
    "Top-down photo straight down on an even natural football grass surface, short healthy green blades, no mowing "
    "stripes, no lines, no shadows, uniform soft light, fine texture. No text, no logos.")


def build_grass(seed: int = 12):
    W, H = 1152, 736
    rng = np.random.default_rng(seed)
    base = np.array([46, 110, 52], np.float32)
    noise = rng.normal(0, 1, (H // 4, W // 4))
    n = np.asarray(Image.fromarray(((noise * 32) + 128).clip(0, 255).astype(np.uint8)).resize((W, H), Image.BICUBIC),
                   np.float32) - 128
    fine = rng.normal(0, 14, (H, W))
    a = base + ((n * 0.35 + fine)[..., None] * np.array([0.5, 1.0, 0.45], np.float32))
    src = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    painted = comfy.refine("club-grass-plain", GRASS_PROMPT, src, seed, 0.62).resize((W, H), Image.LANCZOS)
    img = comfy.match_mean(comfy.flatten_light(painted, 120), (46, 104, 50), 0.9)
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / "grass-plain.webp", quality=86, method=6)
    DEBUG.mkdir(exist_ok=True)
    painted.save(DEBUG / "grass-painted.png")


if __name__ == "__main__":
    what = sys.argv[1:] or ["stadium", "grass"]
    if "stadium" in what:
        build_stadium()
    if "grass" in what:
        build_grass()
