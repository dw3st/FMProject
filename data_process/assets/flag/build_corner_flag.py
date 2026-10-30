"""Corner flag sprite (4.41.24, user report): a vector layout (pole seen from above + a waving pennant) refined by FLUX
img2img, then split into two layers: the cloth in grey (the game tints it with the home colour) and the pole.
Output: src/example_data/assets/flag/corner-cloth.png, corner-pole.png (256 px; pole centre at (40, 128), the cloth
points to +x)."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import comfy

S = 768
K = S / 256
OUT = Path(r"C:\projects\FMProject\src\example_data\assets\flag")
PX, PY = 40 * K, 128 * K
# Cloth: a pennant from the pole to the right, the free edge waving.
def cloth_poly():
    top, bot = [], []
    for i in range(41):
        t = i / 40
        x = PX + 8 * K + t * 196 * K
        wave = np.sin(t * 3.4 * np.pi) * 7 * K * t
        half = (50 * K) * (1 - 0.97 * t)
        top.append((x, PY - half + wave))
        bot.append((x, PY + half * 0.75 + wave))
    return top + bot[::-1]
lay = Image.new("RGB", (S, S), (34, 92, 52))
d = ImageDraw.Draw(lay)
poly = cloth_poly()
d.polygon([(x + 10 * K, y + 14 * K) for x, y in poly], fill=(20, 60, 34))  # shadow on the grass
lay = lay.filter(ImageFilter.GaussianBlur(3 * K))
m = Image.new("L", (S, S), 0); ImageDraw.Draw(m).polygon(poly, fill=255)
yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
t = np.clip((xx - PX) / (204 * K), 0, 1)
# soft folds: light/dark bands across the cloth, stronger toward the free end, plus a light top edge
shade = 0.86 + 0.12 * np.sin(t * 5.5 * np.pi + (yy - PY) / (60 * K)) * (0.35 + 0.65 * t) + 0.05 * (1 - (yy - (PY - 40 * K)) / (90 * K))
cl = np.clip(shade, 0.55, 1.0)[..., None] * np.array([232, 232, 236], np.float32)
base = np.asarray(lay, np.float32)
mm = np.asarray(m.filter(ImageFilter.GaussianBlur(0.8 * K)), np.float32)[..., None] / 255
lay = Image.fromarray((base * (1 - mm) + cl * mm).astype(np.uint8))
d = ImageDraw.Draw(lay)
d.ellipse([PX - 14 * K, PY - 14 * K, PX + 14 * K, PY + 14 * K], fill=(250, 250, 250), outline=(60, 60, 64), width=int(2 * K))
d.ellipse([PX - 5 * K, PY - 5 * K, PX + 5 * K, PY + 5 * K], fill=(205, 205, 210))
lay.save(Path(__file__).with_name("layout.png"))
prompt = ("Top-down view of a white football corner flag on a short green grass pitch: the flag pole seen from above as "
          "a white round cap, a white fabric pennant waving in the wind with soft folds and creases, gentle shadow on the "
          "grass, clean stylised video game art, crisp edges. No text, no logos.")
out = comfy.refine("corner-flag", prompt, lay, 5, 0.6)
out.save(Path(__file__).with_name("painted.png"))
a = np.asarray(out.convert("L"), np.float32) / 255
mask_c = Image.new("L", (S, S), 0); ImageDraw.Draw(mask_c).polygon(poly, fill=255)
mask_p = Image.new("L", (S, S), 0); ImageDraw.Draw(mask_p).ellipse([PX - 14 * K, PY - 14 * K, PX + 14 * K, PY + 14 * K], fill=255)
mc = np.asarray(mask_c.filter(ImageFilter.GaussianBlur(1.2)), np.float32) / 255
mp = np.asarray(mask_p.filter(ImageFilter.GaussianBlur(1.0)), np.float32) / 255
mc = mc * (1 - mp)
lum = a[mc > 0.5]
g = np.clip((a - np.percentile(lum, 2)) / (np.percentile(lum, 99) - np.percentile(lum, 2)), 0, 1)
g = (0.55 + 0.45 * g) * 255
cloth = np.dstack([g, g, g, mc * 255]).astype(np.uint8)
rgb = np.asarray(out.convert("RGB"), np.float32)
pole = np.dstack([rgb, mp * 255]).astype(np.uint8)
OUT.mkdir(parents=True, exist_ok=True)
Image.fromarray(cloth, "RGBA").resize((256, 256), Image.LANCZOS).save(OUT / "corner-cloth.png", optimize=True)
Image.fromarray(pole, "RGBA").resize((256, 256), Image.LANCZOS).save(OUT / "corner-pole.png", optimize=True)
print("ok")
