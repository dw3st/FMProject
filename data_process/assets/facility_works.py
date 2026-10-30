"""Facility "under works" overlays (4.41.20): construction foreground (scaffolding with safety netting, a tower crane,
barrier panels, a work lamp, dust) laid out as a vector scene over a painted facility for context, refined by FLUX
img2img, then cut out with the layout's own mask so only the construction is kept (the facility under it shows
through). Two overlays: `outdoor` (stadium, pitches, lodging: tower crane) and `indoor` (gym, pool, physio, canteen:
scaffolding on both sides, a hanging tarp, no crane).

Needs ComfyUI on http://127.0.0.1:8188 (see comfy.py) and the painted facilities on a local dev server
(http://localhost:3003) for the context backgrounds. Output: src/example_data/assets/facilities-works/works-<kind>.webp
(1280x800 RGBA, lossy webp with alpha)."""
from __future__ import annotations

import io
import math
import sys
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, r"C:\projects\FMProject\data_process\assets")
import comfy  # noqa: E402

W, H = 1280, 800
SS = 2  # supersampling of the layout
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "src" / "example_data" / "assets" / "facilities-works"
DEBUG = Path(__file__).resolve().parent / "works_debug"
CONTEXT = {"outdoor": "facility-stadium-structure-3", "indoor": "facility-gym-3"}

STEEL = (150, 160, 176)
STEEL_DARK = (78, 86, 102)
NET = (226, 112, 34)
CRANE = (236, 182, 40)
RED = (204, 44, 40)
WHITE = (236, 236, 236)


def context(kind: str) -> Image.Image:
    url = f"http://localhost:3003/assets/art/v1/facilities/{CONTEXT[kind]}.webp"
    with urllib.request.urlopen(url, timeout=30) as r:
        im = Image.open(io.BytesIO(r.read())).convert("RGB")
    return im.resize((W, H), Image.LANCZOS)


class Layer:
    """Colour + coverage canvas drawn at SS× and reduced: the colour is the layout FLUX paints over, the coverage is
    the alpha of the final overlay."""

    def __init__(self):
        self.rgb = Image.new("RGB", (W * SS, H * SS), (0, 0, 0))
        self.a = Image.new("L", (W * SS, H * SS), 0)
        self.d = ImageDraw.Draw(self.rgb)
        self.m = ImageDraw.Draw(self.a)

    def s(self, pts):
        return [(x * SS, y * SS) for x, y in pts]

    def line(self, pts, fill, width, alpha=255):
        self.d.line(self.s(pts), fill=fill, width=int(width * SS), joint="curve")
        self.m.line(self.s(pts), fill=alpha, width=int(width * SS), joint="curve")

    def poly(self, pts, fill, alpha=255):
        self.d.polygon(self.s(pts), fill=fill)
        self.m.polygon(self.s(pts), fill=alpha)

    def rect(self, x0, y0, x1, y1, fill, alpha=255):
        self.poly([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], fill, alpha)

    def done(self):
        return self.rgb.resize((W, H), Image.LANCZOS), self.a.resize((W, H), Image.LANCZOS)


def scaffold(L: Layer, x0: float, x1: float, top: float, bottom: float, bays: int, lifts: int, net_side: str):
    """A scaffold tower: standards, ledgers, diagonal braces, plank decks, orange safety netting on the outer half."""
    xs = [x0 + (x1 - x0) * i / bays for i in range(bays + 1)]
    ys = [top + (bottom - top) * j / lifts for j in range(lifts + 1)]
    # netting first (behind the tubes), semi-opaque mesh
    nx0, nx1 = (x0, (x0 + x1) / 2) if net_side == "left" else ((x0 + x1) / 2, x1)
    L.rect(nx0, top + 6, nx1, bottom - 10, NET, alpha=150)
    for gx in range(int(nx0), int(nx1), 9):
        L.line([(gx, top + 6), (gx, bottom - 10)], (250, 150, 70), 1.2, alpha=170)
    for gy in range(int(top + 6), int(bottom - 10), 9):
        L.line([(nx0, gy), (nx1, gy)], (250, 150, 70), 1.2, alpha=170)
    for j, y in enumerate(ys[1:], 1):
        L.rect(x0 - 4, y - 7, x1 + 4, y, (120, 92, 58))  # plank deck
        L.line([(x0 - 6, y), (x1 + 6, y)], STEEL, 4)  # ledger
        a, b = (xs[0], xs[-1]) if j % 2 else (xs[-1], xs[0])
        L.line([(a, ys[j - 1]), (b, y)], STEEL_DARK, 3)  # brace
        # toe board + guard rail
        L.line([(x0 - 6, y - 26), (x1 + 6, y - 26)], STEEL, 3)
    for x in xs:
        L.line([(x, top - 8), (x, bottom)], STEEL, 5)
        L.rect(x - 9, bottom - 6, x + 9, bottom, STEEL_DARK)  # base plate
    # ladder in the middle bay
    lx = (xs[0] + xs[1]) / 2 if bays > 1 else (x0 + x1) / 2
    L.line([(lx - 8, ys[1] - 7), (lx - 8, bottom)], (180, 170, 150), 2.5)
    L.line([(lx + 8, ys[1] - 7), (lx + 8, bottom)], (180, 170, 150), 2.5)
    for ry in range(int(ys[1]), int(bottom), 18):
        L.line([(lx - 8, ry), (lx + 8, ry)], (180, 170, 150), 2)


def lattice(L: Layer, a, b, width: float, color, step: float = 26, tube: float = 3):
    """A lattice boom from a to b (two chords and zig-zag web)."""
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    n = math.hypot(dx, dy)
    ux, uy = dx / n, dy / n
    px, py = -uy * width / 2, ux * width / 2
    c1 = [(ax + px, ay + py), (bx + px, by + py)]
    c2 = [(ax - px, ay - py), (bx - px, by - py)]
    L.line(c1, color, tube + 1)
    L.line(c2, color, tube + 1)
    k = int(n // step)
    for i in range(k):
        t0, t1 = i * step, (i + 1) * step
        p = (ax + ux * t0 + (px if i % 2 else -px), ay + uy * t0 + (py if i % 2 else -py))
        q = (ax + ux * t1 + (-px if i % 2 else px), ay + uy * t1 + (-py if i % 2 else py))
        L.line([p, q], color, tube * 0.7)


def tower_crane(L: Layer, mast_x: float, top_y: float, jib_to: float, counter_to: float):
    lattice(L, (mast_x, H + 10), (mast_x, top_y + 30), 34, CRANE, step=30)
    # slewing unit + cab
    L.rect(mast_x - 26, top_y + 22, mast_x + 26, top_y + 44, (200, 150, 30))
    L.rect(mast_x - 40, top_y + 26, mast_x - 18, top_y + 52, (60, 70, 88))
    L.rect(mast_x - 37, top_y + 30, mast_x - 21, top_y + 42, (255, 214, 140), alpha=255)  # lit cab window
    # apex and ties
    L.line([(mast_x, top_y + 24), (mast_x, top_y - 34)], CRANE, 5)
    L.line([(mast_x, top_y - 34), (jib_to + 120, top_y + 16)], STEEL, 2)
    L.line([(mast_x, top_y - 34), (counter_to, top_y + 18)], STEEL, 2)
    # jib and counter-jib
    lattice(L, (mast_x - 10, top_y + 24), (jib_to, top_y + 24), 20, CRANE, step=24)
    lattice(L, (mast_x + 10, top_y + 26), (counter_to, top_y + 26), 18, CRANE, step=24)
    L.rect(counter_to - 70, top_y + 34, counter_to - 18, top_y + 66, (110, 114, 124))  # counterweight
    # trolley, cable, hook block, a hanging steel beam
    tx = jib_to + (mast_x - jib_to) * 0.38
    L.rect(tx - 12, top_y + 34, tx + 12, top_y + 42, STEEL_DARK)
    L.line([(tx - 3, top_y + 42), (tx - 3, top_y + 150)], (40, 44, 52), 2)
    L.line([(tx + 3, top_y + 42), (tx + 3, top_y + 150)], (40, 44, 52), 2)
    L.rect(tx - 10, top_y + 150, tx + 10, top_y + 170, CRANE)
    L.line([(tx, top_y + 170), (tx - 60, top_y + 200)], (40, 44, 52), 2)
    L.line([(tx, top_y + 170), (tx + 60, top_y + 200)], (40, 44, 52), 2)
    L.rect(tx - 90, top_y + 200, tx + 90, top_y + 218, (96, 104, 120))  # steel I-beam
    L.line([(tx - 90, top_y + 202), (tx + 90, top_y + 202)], (190, 198, 212), 3)
    # red warning light on the apex
    L.poly([(mast_x - 6, top_y - 40), (mast_x + 6, top_y - 40), (mast_x + 6, top_y - 30), (mast_x - 6, top_y - 30)], (255, 40, 30))


def barriers(L: Layer, y: float, x0: float, x1: float):
    """Row of red/white barrier panels on feet across the front, with a sign in the middle."""
    panel = 132
    x = x0
    while x < x1:
        top, bot = y, y + 54
        L.rect(x + 4, top, x + panel - 4, bot, WHITE)
        # diagonal red stripes, clipped to the panel
        for k in range(-4, 8):
            sx = x + 4 + k * 30
            pts = [(sx, top), (sx + 15, top), (sx + 15 - 27, bot), (sx - 27, bot)]
            pts = [(min(max(px, x + 4), x + panel - 4), py) for px, py in pts]
            L.poly(pts, RED)
        L.line([(x + 4, top + 2), (x + panel - 4, top + 2)], (255, 255, 255), 2)
        L.line([(x + 4, bot - 1), (x + panel - 4, bot - 1)], (90, 30, 30), 3)
        L.line([(x + 14, bot), (x + 14, bot + 46)], STEEL_DARK, 6)
        L.line([(x + panel - 14, bot), (x + panel - 14, bot + 46)], STEEL_DARK, 6)
        L.rect(x + 2, bot + 40, x + 30, bot + 50, (40, 40, 44))
        L.rect(x + panel - 30, bot + 40, x + panel - 2, bot + 50, (40, 40, 44))
        # blinking lamp on every other panel
        if int((x - x0) / panel) % 2 == 0:
            L.rect(x + panel / 2 - 7, top - 16, x + panel / 2 + 7, top, (255, 170, 30))
        x += panel


def work_lamp(L: Layer, x: float, y: float, aim: float):
    """Tripod work lamp; returns the glow centre."""
    L.line([(x, y), (x - 34, y + 120)], STEEL_DARK, 4)
    L.line([(x, y), (x + 34, y + 120)], STEEL_DARK, 4)
    L.line([(x, y), (x, y + 124)], STEEL_DARK, 4)
    hx, hy = x + 26 * aim, y - 10
    L.poly([(hx - 26, hy - 18), (hx + 26, hy - 18), (hx + 30, hy + 18), (hx - 30, hy + 18)], (54, 58, 68))
    L.rect(hx - 22, hy - 12, hx + 22, hy + 12, (255, 236, 180))
    return hx, hy


def tarp(L: Layer, x0: float, x1: float, y0: float, y1: float):
    """A translucent plastic dust sheet hanging from the ceiling, folds as vertical bands."""
    folds = 9
    for i in range(folds):
        a = x0 + (x1 - x0) * i / folds
        b = x0 + (x1 - x0) * (i + 1) / folds
        shade = 150 + (30 if i % 2 else -10)
        sag = 18 * math.sin((i + 0.5) / folds * math.pi)
        L.poly([(a, y0), (b, y0), (b + 6, y1 - sag), (a + 6, y1 - sag)], (shade, shade + 8, shade + 16), alpha=150)
    L.line([(x0 - 10, y0), (x1 + 10, y0)], STEEL, 4)


def layout(kind: str):
    L = Layer()
    if kind == "outdoor":
        tower_crane(L, mast_x=W * 0.86, top_y=60, jib_to=W * 0.26, counter_to=W * 1.02)
        scaffold(L, 18, 250, 150, H - 4, bays=2, lifts=4, net_side="left")
        lamp = work_lamp(L, 330, H - 220, aim=1)
        barriers(L, H - 118, 260, W - 150)
    else:
        tarp(L, W * 0.30, W * 0.58, 0, H * 0.42)
        scaffold(L, 14, 230, 120, H - 4, bays=2, lifts=4, net_side="left")
        scaffold(L, W - 230, W - 14, 170, H - 4, bays=2, lifts=3, net_side="right")
        lamp = work_lamp(L, 320, H - 220, aim=1)
        barriers(L, H - 118, 250, W - 250)
    rgb, a = L.done()
    return rgb, a, lamp


PROMPT = {
    "outdoor": ("Night construction site in front of a football stadium: a tall yellow lattice tower crane with a long jib "
                "lifting a steel beam, galvanized steel scaffolding with wooden planks and orange safety netting on the "
                "left, a row of red and white striped safety barriers with amber warning lamps across the front, a bright "
                "tripod work light, a little dust in the air. Polished stylized digital illustration, clean shapes, soft "
                "night lighting, deep navy blue tones, detailed metal. No text, no letters, no logos, no people."),
    "indoor": ("Night renovation works inside a sports building: galvanized steel scaffolding towers with wooden planks and "
               "orange safety netting on both sides, a translucent plastic dust sheet hanging from the ceiling, a row of "
               "red and white striped safety barriers with amber warning lamps across the front, a bright tripod work "
               "light, light dust in the air. Polished stylized digital illustration, clean shapes, soft lighting, deep "
               "navy blue tones, detailed metal. No text, no letters, no logos, no people."),
}


def build(kind: str, seed: int):
    rgb, a, (lx, ly) = layout(kind)
    ctx = context(kind)
    an = np.asarray(a, np.float32)[..., None] / 255
    comp = np.asarray(ctx, np.float32) * 0.5 * (1 - an) + np.asarray(rgb, np.float32) * an
    src = Image.fromarray(comp.astype(np.uint8))
    painted = comfy.refine(f"facility-works-{kind}", PROMPT[kind], src, seed, 0.62)
    painted = painted.resize((W, H), Image.LANCZOS)
    # alpha: the layout coverage, slightly grown and feathered (FLUX softens the edges)
    alpha = a.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.6))
    al = np.asarray(alpha, np.float32) / 255
    # warm glow of the work lamp and a dust haze along the bottom, as light partial coverage
    yy, xx = np.mgrid[0:H, 0:W]
    glow = np.exp(-(((xx - lx - 160) / 260) ** 2 + ((yy - ly - 40) / 150) ** 2))
    haze = np.clip((yy - H * 0.55) / (H * 0.45), 0, 1) ** 2
    # FLUX finish, with a share of the layout kept so thin tubes never melt into the scene behind them
    col = np.asarray(painted, np.float32) * 0.72 + np.asarray(rgb, np.float32) * 0.28
    glow_rgb = np.array([255, 214, 150], np.float32)
    dust_rgb = np.array([150, 140, 125], np.float32)
    extra = np.clip(glow * 0.42 + haze * 0.16, 0, 1)
    tint = (glow_rgb * (glow * 0.42)[..., None] + dust_rgb * (haze * 0.16)[..., None]) / np.maximum(extra, 1e-4)[..., None]
    out_a = al + extra * (1 - al)
    out_rgb = (col * al[..., None] + tint * (extra * (1 - al))[..., None]) / np.maximum(out_a, 1e-4)[..., None]
    rgba = np.dstack([np.clip(out_rgb, 0, 255), np.clip(out_a * 255, 0, 255)]).astype(np.uint8)
    over = Image.fromarray(rgba, "RGBA")
    OUT.mkdir(parents=True, exist_ok=True)
    over.save(OUT / f"works-{kind}.webp", quality=86, method=6)
    DEBUG.mkdir(exist_ok=True)
    src.save(DEBUG / f"{kind}-layout.png")
    painted.save(DEBUG / f"{kind}-painted.png")
    prev = ctx.convert("RGBA")
    Image.alpha_composite(prev, over).convert("RGB").save(DEBUG / f"{kind}-preview.png")
    print(kind, (OUT / f"works-{kind}.webp").stat().st_size)


if __name__ == "__main__":
    build("outdoor", 41)
    build("indoor", 42)
