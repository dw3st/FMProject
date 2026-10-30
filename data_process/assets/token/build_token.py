"""Player disc rim (4.41.19): a vector medallion rim refined by FLUX img2img, then cut to the ring and greyed so the
game tints it with the kit. Output: src/example_data/assets/player/disc-rim.png (512 px, alpha = ring only)."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import comfy

S = 768
OUT = Path(r"C:\projects\FMProject\src\example_data\assets\player")
R_OUT, R_IN = 0.49 * S, 0.385 * S
y, x = np.mgrid[0:S, 0:S]
cx = cy = S / 2
d = np.hypot(x - cx, y - cy)
ang = np.arctan2(y - cy, x - cx)
# layout: light silver rim lit from the upper left, a groove in the middle, darker lower right; navy centre and bg
t = (d - R_IN) / (R_OUT - R_IN)
light = 0.62 + 0.3 * np.cos(ang + 2.35)
bevel = 0.75 + 0.25 * np.cos(np.pi * (t - 0.5) * 1.2)
groove = 1 - 0.35 * np.exp(-((t - 0.5) / 0.06) ** 2)
v = np.clip(light * bevel * groove, 0, 1)
img = np.zeros((S, S, 3), np.float32)
img[:] = (22, 33, 58)
ring = (d >= R_IN) & (d <= R_OUT)
for c, k in enumerate((205, 210, 220)):
    img[..., c] = np.where(ring, v * k, img[..., c])
src = Image.fromarray(img.astype(np.uint8))
src.save(Path(__file__).with_name("layout.png"))
prompt = ("A polished brushed-silver metal medallion ring seen from the front, like the rim of a premium sports token or a "
          "coin bezel, soft studio light from the upper left, fine bevel and a thin engraved groove around the middle, "
          "subtle specular highlights, smooth and clean, plain dark navy background and dark navy centre. No text, no "
          "logos, no numbers, no symbols.")
out = comfy.refine("disc-rim", prompt, src, 11, 0.55)
out.save(Path(__file__).with_name("painted.png"))
a = np.asarray(out.convert("L"), np.float32) / 255
# keep the ring only, feather the edges, normalise to a light grey the tint multiplies
ri, ro = R_IN + 2, R_OUT - 2
alpha = np.clip(np.minimum(d - ri, ro - d) / 3 + 0.5, 0, 1)
lum = a[ring]
a = np.clip((a - np.percentile(lum, 3)) / (np.percentile(lum, 99) - np.percentile(lum, 3)), 0, 1)
g = (0.45 + 0.55 * a) * 255
rgba = np.dstack([g, g, g, alpha * 255]).astype(np.uint8)
OUT.mkdir(parents=True, exist_ok=True)
Image.fromarray(rgba, "RGBA").resize((512, 512), Image.LANCZOS).save(OUT / "disc-rim.png", optimize=True)
print("ok", (OUT / "disc-rim.png").stat().st_size)
