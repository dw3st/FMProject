"""Casino symbols (user report: "faz no comfy pra ficar pro"): vector layouts refined by FLUX img2img on the local
ComfyUI, cut out by the layout mask. Output: src/example_data/assets/casino/<name>-1.webp (256 px; the plane 512 px
wide) and painted/<name>.png (full size, for checking).

    python -I data_process/assets/casino/build_casino_symbols.py [name ...] [--seed name=N] [--regen]
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, r"C:\projects\fmproject\data_process\assets")  # comfy.py / common.py live in the main checkout
import comfy  # noqa: E402

S = 1024
BG = (13, 17, 28)
VERSION = 1
OUT = ROOT / "src" / "example_data" / "assets" / "casino"
PAINTED = HERE / "painted"
FONT = r"C:\Windows\Fonts\impact.ttf"

STYLE = ("glossy polished casino slot machine icon, premium mobile game art, rich saturated colours, soft studio "
         "lighting with a bright specular highlight, subtle dark outline, centered single object on a plain dark navy "
         "background, crisp clean edges, no other objects, no text, no letters, no watermark")


class Canvas:
    """RGB layout over the dark background and the mask of everything drawn (the cut-out)."""

    def __init__(self, w=S, h=S):
        self.w, self.h = w, h
        self.img = Image.new("RGB", (w, h), BG)
        self.mask = Image.new("L", (w, h), 0)

    def shape(self, draw_fn, top, bottom, outline=None, width=0, light=(0.35, 0.3)):
        """Fill a shape with a vertical gradient plus a soft highlight; draw_fn(draw, fill) paints it."""
        m = Image.new("L", (self.w, self.h), 0)
        draw_fn(ImageDraw.Draw(m), 255)
        a = np.asarray(m, np.float32) / 255
        ys, xs = np.nonzero(a > 0)
        if len(ys) == 0:
            return
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        yy, xx = np.mgrid[0:self.h, 0:self.w].astype(np.float32)
        t = np.clip((yy - y0) / max(1, y1 - y0), 0, 1)[..., None]
        col = np.array(top, np.float32) * (1 - t) + np.array(bottom, np.float32) * t
        hx, hy = x0 + (x1 - x0) * light[0], y0 + (y1 - y0) * light[1]
        r = max(x1 - x0, y1 - y0) * 0.45
        g = np.clip(1 - np.hypot(xx - hx, yy - hy) / r, 0, 1)[..., None] ** 2 * 0.45
        col = col * (1 - g) + 255 * g
        base = np.asarray(self.img, np.float32)
        out = base * (1 - a[..., None]) + col * a[..., None]
        self.img = Image.fromarray(out.clip(0, 255).astype(np.uint8))
        if outline:
            draw_fn(_Outline(ImageDraw.Draw(self.img), outline, width), None)
        mm = Image.new("L", (self.w, self.h), 0)
        draw_fn(_Outline(ImageDraw.Draw(mm), 255, width), 255)
        self.mask = Image.fromarray(np.maximum(np.asarray(self.mask), np.maximum(np.asarray(m), np.asarray(mm))))

    def draw(self):
        return ImageDraw.Draw(self.img)

    def add_mask(self, fn):
        d = ImageDraw.Draw(self.mask)
        fn(d)


class _Outline:
    """An ImageDraw stand-in that strokes every shape instead of filling it."""

    def __init__(self, d, colour, width):
        self.d, self.c, self.w = d, colour, width

    def polygon(self, pts, fill=None):
        self.d.line(list(pts) + [pts[0]], fill=self.c, width=self.w, joint="curve")

    def ellipse(self, box, fill=None):
        self.d.ellipse(box, outline=self.c, width=self.w)

    def rounded_rectangle(self, box, radius, fill=None):
        self.d.rounded_rectangle(box, radius, outline=self.c, width=self.w)

    def rectangle(self, box, fill=None):
        self.d.rectangle(box, outline=self.c, width=self.w)

    def pieslice(self, box, a0, a1, fill=None):
        self.d.pieslice(box, a0, a1, outline=self.c, width=self.w)


# --- classic machine --------------------------------------------------------------------------------------------

def seven():
    c = Canvas()
    pts = [(250, 190), (790, 190), (790, 310), (560, 840), (380, 840), (610, 330), (250, 330)]
    c.shape(lambda d, f: d.polygon(pts, fill=f), (255, 80, 70), (160, 10, 20), (255, 200, 60), 26)
    return c, "a big bold red number seven slot symbol with a gold rim, " + STYLE.replace(", no letters", "")


def bar():
    c = Canvas()
    c.shape(lambda d, f: d.rounded_rectangle([130, 330, 894, 700], 70, fill=f), (60, 62, 72), (12, 12, 16),
            (255, 196, 60), 26)
    font = ImageFont.truetype(FONT, 300)
    d = c.draw()
    d.text((512, 515), "BAR", font=font, anchor="mm", fill=(255, 214, 90), stroke_width=10, stroke_fill=(120, 70, 10))
    return c, "a black glossy BAR plate slot symbol with gold BAR lettering and a gold rim, " + STYLE.replace(", no text, no letters", "")


def bell():
    c = Canvas()
    body = [(512, 170)]
    pts = []
    for i in range(0, 181, 6):
        a = np.radians(180 + i)
        pts.append((512 + 230 * np.cos(a), 420 + 250 * np.sin(a)))
    pts = [(282, 420)] + pts[1:] + [(742, 420), (760, 640), (860, 760), (164, 760), (264, 640)]
    c.shape(lambda d, f: d.ellipse([462, 740, 562, 860], fill=f), (255, 210, 80), (180, 110, 10), (120, 70, 10), 14)
    c.shape(lambda d, f: d.polygon(pts, fill=f), (255, 226, 110), (200, 120, 10), (120, 70, 10), 18)
    c.shape(lambda d, f: d.rounded_rectangle([460, 120, 564, 200], 30, fill=f), (255, 220, 100), (190, 120, 10), (120, 70, 10), 12)
    return c, "a shiny golden bell slot symbol, " + STYLE


def lemon():
    c = Canvas()
    c.shape(lambda d, f: d.ellipse([170, 300, 854, 780], fill=f), (255, 240, 90), (220, 170, 0), (150, 110, 0), 16)
    c.shape(lambda d, f: d.ellipse([130, 500, 230, 580], fill=f), (250, 225, 60), (210, 160, 0))
    c.shape(lambda d, f: d.ellipse([794, 500, 894, 580], fill=f), (250, 225, 60), (210, 160, 0))
    c.shape(lambda d, f: d.polygon([(520, 320), (640, 170), (800, 150), (720, 290)], fill=f), (110, 210, 80),
            (30, 120, 40), (20, 80, 30), 10)
    return c, "a juicy yellow lemon with a green leaf slot symbol, " + STYLE


def cherry():
    c = Canvas()
    d = c.draw()
    d.line([(350, 620), (420, 380), (560, 200), (650, 140)], fill=(60, 140, 50), width=34, joint="curve")
    d.line([(680, 640), (650, 400), (650, 140)], fill=(60, 140, 50), width=34, joint="curve")
    c.add_mask(lambda m: (m.line([(350, 620), (420, 380), (560, 200), (650, 140)], fill=255, width=34, joint="curve"),
                          m.line([(680, 640), (650, 400), (650, 140)], fill=255, width=34, joint="curve")))
    c.shape(lambda d, f: d.polygon([(650, 150), (800, 110), (880, 190), (760, 230)], fill=f), (120, 210, 80),
            (30, 120, 40), (20, 80, 30), 10)
    c.shape(lambda d, f: d.ellipse([170, 540, 510, 880], fill=f), (255, 70, 80), (150, 0, 20), (90, 0, 10), 14)
    c.shape(lambda d, f: d.ellipse([510, 560, 850, 900], fill=f), (255, 70, 80), (150, 0, 20), (90, 0, 10), 14)
    return c, "a pair of glossy red cherries on green stems with a leaf slot symbol, " + STYLE


# --- stadium machine ----------------------------------------------------------------------------------------------

def ball():
    c = Canvas()
    c.shape(lambda d, f: d.ellipse([170, 170, 854, 854], fill=f), (255, 255, 255), (170, 175, 190), (30, 34, 44), 18)
    d = c.draw()
    cx, cy = 512, 512
    pent = [(cx + 110 * np.cos(np.radians(-90 + 72 * i)), cy + 110 * np.sin(np.radians(-90 + 72 * i))) for i in range(5)]
    d.polygon(pent, fill=(28, 30, 38))
    for i in range(5):
        a = np.radians(-90 + 72 * i)
        px, py = cx + 110 * np.cos(a), cy + 110 * np.sin(a)
        qx, qy = cx + 250 * np.cos(a), cy + 250 * np.sin(a)
        d.line([(px, py), (qx, qy)], fill=(28, 30, 38), width=18)
        b = np.radians(-90 + 72 * i + 36)
        bx, by = cx + 330 * np.cos(b), cy + 330 * np.sin(b)
        d.ellipse([bx - 70, by - 70, bx + 70, by + 70], fill=(28, 30, 38))
    return c, "a classic black and white leather football soccer ball, no motion lines, slot symbol, " + STYLE


def boot():
    c = Canvas()
    pts = [(170, 400), (420, 400), (470, 470), (720, 540), (850, 610), (870, 690), (840, 730), (170, 730)]
    c.shape(lambda d, f: d.polygon(pts, fill=f), (70, 150, 255), (10, 50, 170), (10, 20, 60), 18)
    c.shape(lambda d, f: d.rounded_rectangle([160, 720, 860, 790], 30, fill=f), (245, 245, 250), (170, 175, 190), (40, 40, 50), 10)
    d = c.draw()
    for x in (230, 380, 560, 740):
        d.rounded_rectangle([x, 790, x + 50, 850], 10, fill=(230, 230, 236))
    c.add_mask(lambda m: [m.rounded_rectangle([x, 790, x + 50, 850], 10, fill=255) for x in (230, 380, 560, 740)])
    for x in (260, 320, 380):
        d.line([(x, 430), (x + 40, 470)], fill=(255, 255, 255), width=16)
    return c, "a blue low-cut football soccer cleat with white sole and studs, side view, slot symbol, " + STYLE


def whistle():
    c = Canvas()
    c.shape(lambda d, f: d.rounded_rectangle([430, 330, 900, 490], 50, fill=f), (240, 242, 248), (130, 135, 150), (30, 34, 44), 16)
    c.shape(lambda d, f: d.ellipse([140, 330, 580, 770], fill=f), (245, 246, 250), (120, 125, 140), (30, 34, 44), 16)
    c.shape(lambda d, f: d.ellipse([90, 250, 230, 390], fill=f), (230, 232, 240), (140, 145, 160), (30, 34, 44), 14)
    d = c.draw()
    d.ellipse([125, 285, 195, 355], fill=BG)
    d.rounded_rectangle([600, 300, 720, 345], 12, fill=(40, 44, 54))
    d.ellipse([290, 480, 430, 620], fill=(70, 74, 88))
    c.add_mask(lambda m: m.rounded_rectangle([600, 300, 720, 345], 12, fill=255))
    return c, "a shiny chrome silver referee whistle with a small metal ring, no cord, slot symbol, " + STYLE


def card():
    c = Canvas()
    red = Image.new("L", (S, S), 0)

    def rect(angle, box):
        x0, y0, x1, y1 = box
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        a = np.radians(angle)
        pts = []
        for px, py in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
            dx, dy = px - cx, py - cy
            pts.append((cx + dx * np.cos(a) - dy * np.sin(a), cy + dx * np.sin(a) + dy * np.cos(a)))
        return pts

    r = rect(-12, (250, 190, 580, 760))
    y = rect(10, (440, 250, 770, 820))
    c.shape(lambda d, f: d.polygon(r, fill=f), (255, 70, 70), (160, 10, 20), (70, 0, 10), 16)
    c.shape(lambda d, f: d.polygon(y, fill=f), (255, 236, 80), (225, 170, 0), (110, 80, 0), 16)
    del red
    return c, "a plain referee yellow card and a plain red card fanned together, blank cards with no markings, slot symbol, " + STYLE


def glove():
    c = Canvas()
    for i, (x, top) in enumerate(((300, 260), (410, 180), (520, 170), (630, 230))):
        c.shape(lambda d, f, x=x, top=top: d.rounded_rectangle([x, top, x + 100, 600], 50, fill=f), (90, 230, 120),
                (20, 130, 60), (10, 60, 30), 12)
    c.shape(lambda d, f: d.ellipse([160, 450, 330, 720], fill=f), (90, 230, 120), (20, 130, 60), (10, 60, 30), 12)
    c.shape(lambda d, f: d.rounded_rectangle([250, 440, 760, 760], 110, fill=f), (90, 230, 120), (20, 130, 60), (10, 60, 30), 12)
    c.shape(lambda d, f: d.rounded_rectangle([280, 730, 740, 860], 30, fill=f), (245, 245, 250), (160, 165, 180), (30, 34, 44), 12)
    return c, "a green goalkeeper glove, palm facing forward, with a white wrist strap, slot symbol, " + STYLE


def trophy():
    c = Canvas()
    cup = []
    for i in range(0, 181, 6):
        a = np.radians(i)
        cup.append((512 + 220 * np.cos(a), 300 + 280 * np.sin(a)))
    cup = [(732, 170)] + cup + [(292, 170)]
    d = c.draw()
    for box in ([160, 220, 380, 470], [644, 220, 864, 470]):
        d.ellipse(box, outline=(210, 140, 20), width=44)
    c.add_mask(lambda m: [m.ellipse(b, outline=255, width=44) for b in ([160, 220, 380, 470], [644, 220, 864, 470])])
    c.shape(lambda d, f: d.polygon(cup, fill=f), (255, 230, 120), (200, 120, 10), (110, 60, 0), 16)
    c.shape(lambda d, f: d.rectangle([462, 570, 562, 700], fill=f), (250, 210, 90), (180, 110, 10), (110, 60, 0), 10)
    c.shape(lambda d, f: d.rounded_rectangle([320, 690, 704, 860], 24, fill=f), (90, 60, 40), (40, 24, 14), (20, 12, 6), 12)
    c.shape(lambda d, f: d.rounded_rectangle([360, 740, 664, 800], 10, fill=f), (255, 220, 110), (200, 140, 30))
    return c, "a shiny golden football championship trophy cup with two handles on a dark wooden base, slot symbol, " + STYLE


def crest():
    c = Canvas()
    shield = [(512, 130), (850, 230), (850, 480)]
    for i in range(0, 91, 5):
        a = np.radians(i)
        shield.append((512 + 338 * np.cos(a), 480 + 420 * np.sin(a)))
    left = [(1024 - x, y) for x, y in reversed(shield[2:])]
    shield = shield + left + [(174, 230)]
    c.shape(lambda d, f: d.polygon(shield, fill=f), (255, 225, 100), (190, 120, 10), (90, 50, 0), 18)
    inner = [(512 + (x - 512) * 0.78, 520 + (y - 520) * 0.78) for x, y in shield]
    c.shape(lambda d, f: d.polygon(inner, fill=f), (60, 110, 220), (20, 40, 120))
    star = []
    for i in range(10):
        a = np.radians(-90 + 36 * i)
        r = 190 if i % 2 == 0 else 80
        star.append((512 + r * np.cos(a), 500 + r * np.sin(a)))
    c.shape(lambda d, f: d.polygon(star, fill=f), (255, 240, 150), (220, 150, 20), (110, 60, 0), 8)
    return c, ("a generic heraldic football club crest shield, gold rim, royal blue field with a gold star, no club "
               "name, slot symbol, ") + STYLE


# --- plane --------------------------------------------------------------------------------------------------------

def plane():
    c = Canvas(S, S // 2)
    body = [(80, 270), (130, 230), (760, 220), (880, 236), (960, 262), (880, 290), (760, 300), (130, 300)]
    c.shape(lambda d, f: d.polygon([(560, 270), (420, 470), (500, 470), (680, 280)], fill=f), (200, 40, 50), (120, 10, 20), (40, 10, 14), 8)
    c.shape(lambda d, f: d.polygon(body, fill=f), (250, 252, 255), (150, 158, 172), (30, 34, 44), 10)
    c.shape(lambda d, f: d.polygon([(100, 240), (60, 70), (150, 70), (250, 230)], fill=f), (230, 50, 60), (140, 14, 24), (40, 10, 14), 8)
    c.shape(lambda d, f: d.polygon([(110, 270), (40, 330), (110, 330), (220, 280)], fill=f), (230, 50, 60), (140, 14, 24), (40, 10, 14), 8)
    c.shape(lambda d, f: d.rounded_rectangle([470, 300, 600, 350], 24, fill=f), (200, 205, 215), (110, 115, 128), (30, 34, 44), 6)
    d = c.draw()
    for x in range(240, 760, 42):
        d.rounded_rectangle([x, 244, x + 20, 262], 6, fill=(40, 70, 120))
    d.polygon([(860, 236), (920, 248), (900, 256), (850, 252)], fill=(40, 70, 120))
    d.line([(150, 286), (820, 286)], fill=(210, 40, 50), width=8)
    prompt = ("a generic white passenger airliner jet seen from the side, nose to the right, red tail fin, no airline "
              "logo, no livery text, glossy premium mobile game art, soft studio lighting, crisp clean edges, single "
              "object on a plain dark navy background, no text, no letters, no watermark")
    return c, prompt


SYMBOLS = {"seven": seven, "bar": bar, "bell": bell, "lemon": lemon, "cherry": cherry, "ball": ball, "boot": boot,
           "whistle": whistle, "card": card, "glove": glove, "trophy": trophy, "crest": crest, "plane": plane}
SEEDS = {name: 7101 + i for i, name in enumerate(SYMBOLS)}
SEEDS["ball"] = 7206  # 7106 painted motion arcs around the ball
STRENGTH = {"seven": 0.55, "bar": 0.45, "ball": 0.6}


def cutout(img: Image.Image, mask: Image.Image, keep_core: bool = False) -> Image.Image:
    """Alpha = not background: pixels close to the plain background colour connected to the border are cleared (the
    object's own dark outline stays), limited to a band around the layout so stray paint far away goes too."""
    from scipy import ndimage
    a = np.asarray(img, np.float32)
    dist = np.sqrt(((a - np.array(BG, np.float32)) ** 2).sum(-1))
    lab, _ = ndimage.label(dist < 38)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]).tolist())) - {0}
    outside = np.isin(lab, list(edge))
    near = np.asarray(mask.filter(ImageFilter.MaxFilter(21))) > 0
    # the inside of the layout always stays (dark painted parts, the ball's black panels, read as background)
    core = ndimage.binary_erosion(np.asarray(mask) > 0, iterations=10)
    keep = ((~outside) & near) | (core if keep_core else False)
    keep = ndimage.binary_opening(keep, iterations=2)
    keep = ndimage.binary_fill_holes(keep)
    # the last few pixels of the rim fade by their distance to the background colour (no dark halo)
    soft = np.clip((dist - 18) / 30, 0, 1)
    inner = ndimage.binary_erosion(keep, iterations=3)
    al = keep * np.maximum(soft, inner) * 255
    alpha = Image.fromarray(al.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    out = img.convert("RGBA")
    out.putalpha(alpha)
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    regen = "--regen" in sys.argv
    for a in sys.argv[1:]:
        if a.startswith("--seed="):
            k, v = a[len("--seed="):].split("=")
            SEEDS[k] = int(v)
    names = args or list(SYMBOLS)
    OUT.mkdir(parents=True, exist_ok=True)
    PAINTED.mkdir(exist_ok=True)
    for name in names:
        c, prompt = SYMBOLS[name]()
        c.img.save(PAINTED / f"{name}-layout.png")
        painted = comfy.refine(f"casino-{name}", prompt, c.img, SEEDS[name], strength=STRENGTH.get(name, 0.7),
                               steps=10, regen=regen)
        rgba = cutout(painted, c.mask, keep_core=name == "ball")
        rgba.save(PAINTED / f"{name}.png")
        box = rgba.getbbox()
        rgba = rgba.crop(box)
        if name == "plane":
            w = 512
            small = rgba.resize((w, round(rgba.height * w / rgba.width)), Image.LANCZOS)
        else:
            side = max(rgba.size)
            sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
            sq.paste(rgba, ((side - rgba.width) // 2, (side - rgba.height) // 2))
            small = sq.resize((256, 256), Image.LANCZOS)
        small.save(OUT / f"sym-{name}-{VERSION}.webp", "WEBP", quality=92, method=6)
        print("ok", name, SEEDS[name])


if __name__ == "__main__":
    main()
