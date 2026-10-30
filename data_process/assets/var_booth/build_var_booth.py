"""VAR review area by the touchline (tester report: the referee runs to a pitchside monitor). Vector layouts refined by
FLUX img2img, cut out by the layout mask. Output: painted/<name>.png (RGBA, 768 px) and mock-A/B/C.png composed on a
3x capture of the top touchline (`top.png`, the referee cropped from it)."""
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


def monitor():
    """Seen from above: a black sun hood over the screen (glow on the pitch side, at the bottom), on a stand plate."""
    x0, y0, x1, y1 = 164, 250, 604, 470
    img = shadow(base(), lambda d, dx, dy: d.rounded_rectangle([x0 + dx, y0 + dy, x1 + dx, y1 + dy], 30, fill=255))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([284, 420, 484, 560], 24, fill=(48, 52, 58), outline=(20, 22, 26), width=6)   # stand plate
    d.rounded_rectangle([x0, y0, x1, y1], 30, fill=(26, 28, 32), outline=(8, 9, 11), width=8)            # hood
    d.rectangle([x0 + 30, y1 - 46, x1 - 30, y1 - 20], fill=(90, 170, 240))                                  # screen edge
    for i in range(5):
        d.line([x0 + 60 + i * 80, y0 + 30, x0 + 60 + i * 80, y1 - 70], fill=(40, 43, 48), width=6)          # vents
    mask = Image.new("L", (S, S), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([x0, y0, x1, y1], 30, fill=255)
    md.rounded_rectangle([284, 420, 484, 560], 24, fill=255)
    return img, mask, ("Top-down view of a football pitchside video referee review monitor seen from directly above: a "
        "black rectangular sun hood over a screen, a thin bright blue screen edge glowing on one side, a dark metal stand "
        "base, soft shadow on short green grass, clean stylised video game art, crisp edges, no text, no logos.")


def tent():
    """A small black pop-up canopy seen from above: four roof panels meeting at the peak."""
    x0, y0, x1, y1 = 144, 144, 624, 624
    c = S / 2
    img = shadow(base(), lambda d, dx, dy: d.rectangle([x0 + dx, y0 + dy, x1 + dx, y1 + dy], fill=255))
    d = ImageDraw.Draw(img)
    shades = [(30, 32, 36), (44, 47, 52), (24, 26, 30), (38, 41, 46)]
    pts = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    for i in range(4):
        d.polygon([pts[i], pts[(i + 1) % 4], (c, c)], fill=shades[i])
    d.rectangle([x0, y0, x1, y1], outline=(10, 11, 13), width=10)
    d.line([x0, y0, x1, y1], fill=(14, 15, 18), width=6)
    d.line([x1, y0, x0, y1], fill=(14, 15, 18), width=6)
    d.rectangle([x0 + 10, y1 - 34, x1 - 10, y1 - 10], fill=(20, 110, 200))   # valance trim on the pitch side
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rectangle([x0, y0, x1, y1], fill=255)
    return img, mask, ("Top-down view of a small square black pop-up canopy tent seen from directly above on a football "
        "pitch touchline, four fabric roof panels meeting at a central peak with soft folds, a thin blue trim along one "
        "edge, soft shadow on short green grass, clean stylised video game art, crisp edges, no text, no logos.")


only = set(a for a in sys.argv[1:] if a != "mock")
for name, fn, strength, seed in [("monitor", monitor, 0.55, 7), ("tent", tent, 0.55, 7)]:
    if only and name not in only:
        continue
    lay, mask, prompt = fn()
    lay.save(HERE / f"{name}-layout.png")
    out = comfy.refine(f"var-{name}", prompt, lay, seed, strength)
    out.save(HERE / f"{name}-flux.png")
    m = np.asarray(mask.filter(ImageFilter.GaussianBlur(2)), np.float32)
    rgb = np.asarray(out.convert("RGB"), np.float32)
    Image.fromarray(np.dstack([rgb, m]).astype(np.uint8), "RGBA").save(HERE / "painted" / f"{name}.png")
    print(name, "ok")


# ── Mocks on the 3x capture of the top touchline (halfway line at x 772, touchline at y 163) ──────────────────
TOP = Path(r"C:\Users\Administrator\AppData\Local\Temp\pwtest\top.png")
bg = Image.open(TOP).convert("RGBA")
ref = bg.crop((1228, 108, 1322, 196))          # the assistant's figure from the capture, as the referee stand-in
_r = np.asarray(ref, np.float32)
_grass = (_r[..., 1] > _r[..., 0] + 12) & (_r[..., 1] > _r[..., 2] + 4)
_line = (_r[..., :3].min(axis=2) > 150) & (np.ptp(_r[..., :3], axis=2) < 30)
_yy, _xx = np.mgrid[0:_r.shape[0], 0:_r.shape[1]]
_blob = ((_xx - 48) / 42) ** 2 + ((_yy - 54) / 44) ** 2 <= 1    # the figure; drops the touchline bits around it
_m = np.where(_grass | _line | ~_blob, 0, 255).astype(np.uint8)
ref.putalpha(Image.fromarray(_m).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3)))


def paste_scaled(canvas, img, w, cx, cy, rot=0):
    bb = img.getbbox()
    im = img.crop(bb)
    h = round(im.height * w / im.width)
    im = im.resize((w, h), Image.LANCZOS)
    if rot:
        im = im.rotate(rot, expand=True, resample=Image.BICUBIC)
    canvas.alpha_composite(im, (round(cx - im.width / 2), round(cy - im.height / 2)))


def zone(canvas, x0, y0, x1, y1):
    d = ImageDraw.Draw(canvas)
    d.rectangle([x0, y0, x1, y1], outline=(235, 238, 240, 230), width=4)


mon = Image.open(HERE / "painted" / "monitor.png")
tnt = Image.open(HERE / "painted" / "tent.png")
cx, line = 772, 163

a = bg.copy()
zone(a, cx - 70, 98, cx + 70, line + 46)
paste_scaled(a, mon, 66, cx, 126)
a.alpha_composite(ref, (cx - 47, 150))
a.convert("RGB").save(HERE / "mock-A.png")

b = bg.copy()
paste_scaled(b, tnt, 82, cx, 128)
b.alpha_composite(ref, (cx - 47, 150))
b.convert("RGB").save(HERE / "mock-B.png")

c = bg.copy()
paste_scaled(c, mon, 60, cx, 128)
c.alpha_composite(ref, (cx - 47, 146))
c.convert("RGB").save(HERE / "mock-C.png")
print("mocks ok")
