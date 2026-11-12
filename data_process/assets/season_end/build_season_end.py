"""End-of-season screen art (10.5): three trophies (league, national cup, continental) and three banners (a title
season, a good one, a bad one). Vector layouts drawn here, refined by FLUX img2img on the local ComfyUI, one job at a
time. The trophies are cut out of their flat background (flood fill from the border and from the handle holes).

  python data_process/assets/season_end/build_season_end.py [name ...] [--seed N] [--strength X]

Output: painted/<name>.png (trophies, RGBA 512) and painted/<name>.webp (banners, 1600x352)."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import comfy

S = 1024
HERE = Path(__file__).resolve().parent
(HERE / "painted").mkdir(exist_ok=True)
BG = (14, 22, 44)
SILVER = np.array([196, 204, 216], np.float32)
GOLD = np.array([226, 176, 62], np.float32)
MARBLE = np.array([214, 210, 204], np.float32)

YY, XX = np.mgrid[0:S, 0:S].astype(np.float32)


def lathe_mask(profile):
    """A solid of revolution seen from the front: `profile` is a list of (y, half width), top to bottom."""
    left = [(S / 2 - w, y) for y, w in profile]
    right = [(S / 2 + w, y) for y, w in reversed(profile)]
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).polygon(left + right, fill=255)
    return m


def metal(img, mask, base, x0=None, x1=None):
    """Fills the mask with a brushed-metal shading: a bright band left of centre, a thin one on the right."""
    m = np.asarray(mask, np.float32) / 255
    cols = np.where(m.max(0) > 0)[0]
    if len(cols) == 0:
        return img
    x0 = cols[0] if x0 is None else x0
    x1 = cols[-1] if x1 is None else x1
    t = np.clip((XX - x0) / max(1, x1 - x0), 0, 1)
    shade = 0.42 + 0.78 * np.exp(-((t - 0.3) / 0.15) ** 2) + 0.3 * np.exp(-((t - 0.84) / 0.07) ** 2)
    shade *= 1.05 - 0.2 * (YY / S)
    col = np.clip(base[None, None, :] * shade[..., None], 0, 255)
    a = np.asarray(img, np.float32)
    return Image.fromarray((a * (1 - m[..., None]) + col * m[..., None]).astype(np.uint8))


def ring_mask(cx, cy, rx, ry, width, start=0, end=360):
    m = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m).arc([cx - rx, cy - ry, cx + rx, cy + ry], start, end, fill=255, width=width)
    return m


def curve_mask(points, width, mirror=False):
    """A thick smooth stroke through the points (Catmull-Rom), optionally mirrored about the centre line."""
    pts = [points[0]] + list(points) + [points[-1]]
    path = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = (np.array(pts[i + k], np.float32) for k in (-1, 0, 1, 2))
        for t in np.linspace(0, 1, 24, endpoint=False):
            path.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    path.append(np.array(pts[-2], np.float32))
    if mirror:
        path = [np.array([S - q[0], q[1]]) for q in path]
    m = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(m)
    d.line([tuple(q) for q in path], fill=255, width=width, joint="curve")
    for q in (path[0], path[-1]):
        d.ellipse([q[0] - width / 2, q[1] - width / 2, q[0] + width / 2, q[1] + width / 2], fill=255)
    return m


def union(*masks):
    out = np.zeros((S, S), np.uint8)
    for m in masks:
        out = np.maximum(out, np.asarray(m))
    return Image.fromarray(out)


def plinth(img, y0, y1, w0, w1):
    m = lathe_mask([(y0, w0), (y0 + 14, w0 + 10), (y1 - 16, w1), (y1, w1 + 8)])
    img = metal(img, m, MARBLE)
    plate = Image.new("L", (S, S), 0)
    ImageDraw.Draw(plate).rounded_rectangle([S / 2 - w0 * 0.55, y0 + 34, S / 2 + w0 * 0.55, y1 - 34], 6, fill=255)
    return metal(img, plate, GOLD), m


def cup():
    """National cup: a wide silver bowl with two big ear handles on a dark plinth."""
    img = Image.new("RGB", (S, S), BG)
    bowl = lathe_mask([(250, 205), (262, 214), (330, 206), (430, 170), (505, 110), (545, 52), (575, 34)])
    stem = lathe_mask([(570, 34), (610, 26), (650, 30), (672, 62), (700, 120), (716, 126), (730, 96)])
    ear = [(S / 2 - 196, 270), (S / 2 - 290, 258), (S / 2 - 352, 312), (S / 2 - 340, 400), (S / 2 - 262, 462), (S / 2 - 150, 486)]
    lh = curve_mask(ear, 30)
    rh = curve_mask(ear, 30, mirror=True)
    img = metal(img, lh, SILVER)
    img = metal(img, rh, SILVER)
    img = metal(img, stem, SILVER)
    img = metal(img, bowl, SILVER)
    rim = lathe_mask([(238, 212), (250, 218), (264, 214)])
    img = metal(img, rim, GOLD)
    band = lathe_mask([(404, 182), (424, 174), (440, 166), (420, 176)])
    img = metal(img, band, GOLD)
    img, pm = plinth(img, 728, 860, 150, 190)
    holes = [(S / 2 - 262, 360), (S / 2 + 262, 360)]
    return img, union(bowl, stem, lh, rh, rim, pm), holes, (
        "A magnificent national football cup trophy: a large polished silver cup with a wide bowl, two big elegant curved "
        "ear handles sweeping from the rim down to the lower bowl, one on each side, fine engraved laurel ornament on the bowl, a thin gold rim and a gold band, a slim stem, standing on a white marble plinth with a small "
        "blank gold plate. Front view, centred, the whole trophy visible. Studio product shot, dramatic soft rim light, "
        "crisp mirror reflections in the metal, rich detailed digital painting, premium sports video game art. Plain flat "
        "solid dark navy blue background, no floor, no shadow, no text, no letters, no logos, no engraving.")


def league():
    """League trophy: a tall golden cup with a crowned lid and a ball finial, no handles."""
    img = Image.new("RGB", (S, S), BG)
    body = lathe_mask([(330, 150), (345, 158), (420, 150), (520, 112), (590, 60), (625, 36), (660, 30)])
    lid = lathe_mask([(210, 16), (232, 40), (262, 96), (300, 140), (328, 156), (338, 150)])
    crown = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(crown)
    for i in range(7):
        x = S / 2 - 138 + i * 46
        d.polygon([(x - 23, 334), (x, 276 - (18 if i % 2 == 0 else 0)), (x + 23, 334)], fill=255)
    ball = Image.new("L", (S, S), 0)
    ImageDraw.Draw(ball).ellipse([S / 2 - 34, 150, S / 2 + 34, 218], fill=255)
    stem = lathe_mask([(655, 30), (690, 22), (720, 28), (745, 70), (770, 132), (788, 140), (800, 110)])
    img = metal(img, stem, GOLD)
    img = metal(img, body, GOLD)
    img = metal(img, lid, GOLD)
    img = metal(img, crown, GOLD * 1.08)
    img = metal(img, ball, SILVER)
    band = lathe_mask([(508, 120), (522, 113), (540, 100), (526, 110)])
    img = metal(img, band, SILVER)
    img, pm = plinth(img, 798, 900, 160, 196)
    return img, union(body, lid, crown, ball, stem, pm), [], (
        "A magnificent football league champions trophy: a tall slender polished gold cup with a domed lid, a small "
        "crown of pointed tips around the rim and a silver football-sized sphere finial on top, a silver band, a slim "
        "golden stem, standing on a white marble plinth with a small blank gold plate. Front view, centred, the whole "
        "trophy visible. Studio product shot, dramatic soft rim light, crisp mirror reflections in the metal, rich "
        "detailed digital painting, premium sports video game art. Plain flat solid dark navy blue background, no floor, "
        "no shadow, no text, no letters, no logos, no engraving.")


def continental():
    """Continental trophy: a golden globe in a silver ring, carried by a tall tapering silver column."""
    img = Image.new("RGB", (S, S), BG)
    column = lathe_mask([(430, 96), (470, 70), (560, 44), (660, 34), (720, 44), (760, 96), (790, 150), (806, 156), (818, 120)])
    cradle = lathe_mask([(392, 150), (410, 150), (440, 104), (432, 92)])
    globe = Image.new("L", (S, S), 0)
    ImageDraw.Draw(globe).ellipse([S / 2 - 138, 132, S / 2 + 138, 408], fill=255)
    img = metal(img, column, SILVER)
    img = metal(img, cradle, SILVER)
    img = metal(img, globe, GOLD)
    d = ImageDraw.Draw(img)
    # football panels: a centre pentagon, seams running out to the edge
    c, r = np.array([S / 2, 270.0]), 52
    pent = [c + r * np.array([np.sin(k * 2 * np.pi / 5), -np.cos(k * 2 * np.pi / 5)]) for k in range(5)]
    d.polygon([tuple(q) for q in pent], fill=(150, 104, 26))
    for k, q in enumerate(pent):
        out = c + (q - c) * 1.85
        d.line([tuple(q), tuple(out)], fill=(120, 82, 20), width=5)
        nxt = c + (pent[(k + 1) % 5] - c) * 1.85
        mid = c + ((q + pent[(k + 1) % 5]) / 2 - c) * 2.3
        d.line([tuple(out), tuple(mid), tuple(nxt)], fill=(120, 82, 20), width=5)
    img, pm = plinth(img, 816, 912, 166, 200)
    return img, union(column, cradle, globe, pm), [], (
        "A magnificent continental football champions trophy: a large polished solid gold football (soccer ball) with "
        "embossed pentagon and hexagon panels, held up by a tall elegant tapering polished silver column, "
        "standing on a white marble plinth with a small blank gold plate. Front view, centred, the whole trophy visible. "
        "Studio product shot, dramatic soft rim light, crisp mirror reflections in the metal, rich detailed digital "
        "painting, premium sports video game art. Plain flat solid dark navy blue background, no floor, no shadow, no "
        "text, no letters, no logos, no engraving.")


def cutout(painted, layout_mask, holes, tol=34):
    """Alpha from the flat background: everything connected to the border (or to a handle hole) within `tol` of the
    background colour is transparent. The layout mask, grown, limits how far a glow can keep stray pixels."""
    rgb = np.asarray(painted.convert("RGB"), np.float32)
    soft = np.asarray(painted.convert("RGB").filter(ImageFilter.GaussianBlur(1.2)), np.float32)
    corners = np.concatenate([soft[:40, :40].reshape(-1, 3), soft[:40, -40:].reshape(-1, 3),
                              soft[-40:, :40].reshape(-1, 3), soft[-40:, -40:].reshape(-1, 3)])
    bg = np.median(corners, 0)
    dist = np.sqrt(((soft - bg) ** 2).sum(-1))
    r, g, bl = soft[..., 0], soft[..., 1], soft[..., 2]
    shadow = (soft.max(-1) < bg.max() + 8) & (bl >= r) & (bl >= g - 4)
    near = (dist < tol) | shadow
    labels, n = ndimage.label(near)
    keep = set(np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))) - {0}
    for hx, hy in holes:
        patch = labels[int(hy) - 14:int(hy) + 14, int(hx) - 14:int(hx) + 14]
        keep |= set(np.unique(patch)) - {0}
    # enclosed patches of flat background (a reflection of the background in the metal is never flat)
    tight, m = ndimage.label(dist < 12)
    if m:
        lum = soft.mean(-1)
        var = ndimage.uniform_filter(lum ** 2, 9) - ndimage.uniform_filter(lum, 9) ** 2
        idx = np.arange(1, m + 1)
        area = ndimage.sum(np.ones_like(tight), tight, idx)
        flat = ndimage.mean(var, tight, idx)
        holes_lab = idx[(area > 260) & (flat < 3.0)]
    else:
        holes_lab = []
    outside = np.isin(labels, list(keep)) | np.isin(tight, holes_lab)
    grown = ndimage.binary_dilation(np.asarray(layout_mask) > 0, iterations=70)
    alpha = (~outside & grown).astype(np.float32)
    alpha = ndimage.binary_opening(alpha > 0, iterations=2).astype(np.float32)
    alpha = ndimage.gaussian_filter(alpha, 1.1)
    # pull the edge in a little so no background fringe is left
    alpha = np.clip((alpha - 0.35) / 0.5, 0, 1)
    out = np.dstack([rgb, alpha * 255]).astype(np.uint8)
    img = Image.fromarray(out, "RGBA")
    box = img.getbbox()
    if box:
        pad = 12
        box = (max(0, box[0] - pad), max(0, box[1] - pad), min(S, box[2] + pad), min(S, box[3] + pad))
        img = img.crop(box)
    side = max(img.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.paste(img, ((side - img.width) // 2, side - img.height))
    return sq.resize((512, 512), Image.LANCZOS)


# --- banners --------------------------------------------------------------------------------------------------------
BW, BH = 1600, 352


def banner_layout(kind, rng):
    top, bottom = {"title": ((10, 14, 40), (30, 40, 96)), "good": ((34, 52, 110), (232, 150, 96)),
                   "bad": ((52, 58, 70), (104, 112, 126))}[kind]
    y = np.linspace(0, 1, BH)[:, None, None]
    a = np.array(top, np.float32) * (1 - y) + np.array(bottom, np.float32) * y
    a = np.repeat(a, BW, 1)
    img = Image.fromarray(a.astype(np.uint8))
    d = ImageDraw.Draw(img, "RGBA")
    # far stand: a long curved roof line and a crowd band under it
    roof = [(0, 150), (300, 118), (800, 104), (1300, 118), (1600, 150)]
    d.polygon(roof + [(1600, 250), (0, 250)], fill=(26, 30, 46, 255) if kind != "good" else (40, 36, 52, 255))
    d.line(roof, fill=(150, 160, 180, 255), width=5)
    crowd = {"title": [(230, 190, 70), (240, 240, 240), (200, 60, 60)], "good": [(200, 150, 110), (230, 220, 200), (120, 110, 130)],
             "bad": [(70, 76, 90), (90, 96, 108), (56, 60, 72)]}[kind]
    for _ in range(5200 if kind != "bad" else 900):
        x, yy = rng.integers(0, BW), rng.integers(160, 246)
        c = crowd[rng.integers(0, len(crowd))]
        d.rectangle([x, yy, x + 3, yy + 4], fill=(*c, 255))
    # pitch
    d.polygon([(0, 250), (1600, 250), (1600, 352), (0, 352)], fill=(24, 92, 48, 255) if kind != "bad" else (30, 66, 44, 255))
    for i in range(0, 1600, 160):
        d.polygon([(i, 250), (i + 80, 250), (i + 60, 352), (i - 20, 352)], fill=(30, 106, 56, 255) if kind != "bad" else (34, 74, 48, 255))
    d.line([(0, 262), (1600, 262)], fill=(235, 240, 235, 220), width=3)
    # floodlights
    for x in (180, 620, 980, 1420):
        d.line([(x, 118), (x, 40)], fill=(120, 126, 140, 255), width=6)
        d.rectangle([x - 34, 22, x + 34, 46], fill=(250, 250, 235, 255) if kind != "good" else (150, 150, 150, 255))
        if kind != "good":
            for r in range(90, 0, -10):
                d.ellipse([x - r, 34 - r, x + r, 34 + r], fill=(255, 250, 220, 10))
    if kind == "title":
        for cx, cy, col in ((330, 70, (255, 210, 90)), (820, 50, (255, 120, 90)), (1240, 76, (120, 190, 255)), (1500, 44, (255, 230, 150))):
            for k in range(46):
                ang = k / 46 * 2 * np.pi
                r0, r1 = 12, 58 + rng.integers(0, 16)
                d.line([(cx + np.cos(ang) * r0, cy + np.sin(ang) * r0), (cx + np.cos(ang) * r1, cy + np.sin(ang) * r1)], fill=(*col, 230), width=2)
        for _ in range(900):
            x, yy = rng.integers(0, BW), rng.integers(0, BH)
            c = [(240, 196, 70), (250, 250, 250), (210, 60, 70), (70, 130, 230)][rng.integers(0, 4)]
            d.rectangle([x, yy, x + 5, yy + 3], fill=(*c, 235))
    if kind == "bad":
        for _ in range(700):
            x, yy = rng.integers(0, BW), rng.integers(0, BH)
            d.line([(x, yy), (x - 5, yy + 20)], fill=(190, 200, 215, 90), width=1)
    return img


BANNER_PROMPT = {
    "title": ("Wide panoramic view inside a packed football stadium at night during a title celebration: fireworks "
              "bursting in the dark blue sky above the stand roof, bright floodlights, gold and white confetti falling "
              "everywhere, a huge cheering crowd with flags and scarves, the green pitch below. Epic, joyful, rich detailed "
              "digital painting, premium sports video game art, cinematic lighting. One single continuous image. Plain blank "
              "advertising boards and plain flags, no text, no letters, no numbers, no logos, no signs."),
    "good": ("Wide panoramic view inside a big modern football stadium at golden hour after the last match of the "
             "season: glowing orange and pink sunset sky with soft clouds above the stand roof, the stands full of fans "
             "applauding and waving plain scarves, floodlights just turning on, long warm light and shadows across the "
             "striped green pitch. Proud, satisfied mood. Rich detailed realistic digital painting, premium sports video "
             "game art, cinematic lighting. One single continuous image. Plain blank advertising boards, no text, no "
             "letters, no numbers, no logos, no signs."),
    "bad": ("Wide panoramic view inside a football stadium on a dark grey rainy evening after a bad season: heavy "
            "storm clouds, rain falling, the far stand almost empty with a few fans leaving, dim floodlights glowing in "
            "the mist, wet dull green pitch with puddles. Sad, quiet mood. Rich detailed realistic digital painting, "
            "premium sports video game art, cinematic lighting. One single continuous panoramic image, one stadium, no "
            "split, no panels, no frame. Plain blank advertising boards, no text, no letters, no numbers, no logos."),
}

TROPHIES = {"cup": cup, "league": league, "continental": continental}
SEEDS = {"cup": 7, "league": 7, "continental": 7, "title": 23, "good": 31, "bad": 42}

args = sys.argv[1:]
seed_over = int(args[args.index("--seed") + 1]) if "--seed" in args else None
strength = float(args[args.index("--strength") + 1]) if "--strength" in args else None
only = {a for a in args if not a.startswith("--") and not a.replace(".", "").isdigit()}

for name, fn in TROPHIES.items():
    if only and name not in only:
        continue
    lay, mask, holes, prompt = fn()
    lay.save(HERE / f"trophy-{name}-layout.png")
    seed = seed_over or SEEDS[name]
    out = comfy.refine(f"season-trophy-{name}", prompt, lay, seed, strength or 0.64, steps=12)
    out.save(HERE / f"trophy-{name}-flux.png")
    cutout(out, mask, holes).save(HERE / "painted" / f"trophy-{name}.png")
    print("trophy", name, "ok")

for name in ("title", "good", "bad"):
    if only and name not in only:
        continue
    lay = banner_layout(name, np.random.default_rng(3))
    lay.save(HERE / f"banner-{name}-layout.png")
    seed = seed_over or SEEDS[name]
    out = comfy.refine(f"season-banner-{name}", BANNER_PROMPT[name], lay, seed, strength or 0.78, steps=12)
    out.save(HERE / "painted" / f"banner-{name}.webp", quality=88, method=6)
    print("banner", name, "ok")
