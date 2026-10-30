"""LED board frame (tester report, 4.42): a vector housing (graphite metal, bevel, bolts, vents, a recessed screen)
refined by FLUX.2 klein img2img, then the screen cut out. Output: src/example_data/assets/led/led-frame.png
(1024 x 96, the screen rectangle (12, 12, 1000, 64) transparent; `LED_FRAME` in pitchStyle.ts)."""
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
sys.path.insert(0, r"C:\projects\FMProject\data_process\assets")
import comfy

W, H = 1536, 144
SX, SY, SW, SH = 18, 18, 1500, 96
OUT = Path(__file__).resolve().parents[3] / "src" / "example_data" / "assets" / "led"

y, x = np.mgrid[0:H, 0:W].astype(np.float32)
# housing: graphite, lit from the top, darker at the bottom, a soft bevel along the edge
base = 58 + 34 * (1 - y / H)
edge = np.minimum.reduce([x, W - 1 - x, y, H - 1 - y])
bevel = np.clip(1 - edge / 7, 0, 1)
v = base + 55 * bevel * (y < H / 2) - 25 * bevel * (y >= H / 2)
img = np.dstack([v * 0.92, v * 0.97, v * 1.05]).clip(0, 255).astype(np.uint8)
im = Image.fromarray(img)
d = ImageDraw.Draw(im)
# recessed screen: dark lip then black glass
d.rectangle([SX - 5, SY - 5, SX + SW + 4, SY + SH + 4], fill=(18, 20, 24))
d.rectangle([SX, SY, SX + SW - 1, SY + SH - 1], fill=(6, 8, 10))
# bolts on the top and bottom rails, end cheeks with vents
for bx in range(60, W - 40, 180):
    for by in (9, H - 10):
        d.ellipse([bx - 4, by - 4, bx + 4, by + 4], fill=(150, 156, 166), outline=(30, 32, 36))
for side in (6, W - 14):
    for vy in range(30, H - 30, 12):
        d.rectangle([side, vy, side + 7, vy + 5], fill=(24, 26, 30))
src = im.filter(ImageFilter.GaussianBlur(0.6))
src.save(Path(__file__).with_name("layout.png"))
prompt = ("Front view of the metal housing of a stadium perimeter LED advertising board, dark graphite powder-coated "
          "aluminium with a soft bevel, small steel bolts along the top and bottom rails, vent slots on the ends, a "
          "recessed black glass screen in the middle, studio light from above, clean product render. No text, no logos.")
out = comfy.refine("led-frame", prompt, src, 7, 0.45)
out.save(Path(__file__).with_name("painted.png"))
a = np.asarray(out.convert("RGB"), np.float32)
alpha = np.full((H, W), 255, np.float32)
alpha[SY:SY + SH, SX:SX + SW] = 0
rgba = np.dstack([a, alpha]).astype(np.uint8)
OUT.mkdir(parents=True, exist_ok=True)
Image.fromarray(rgba, "RGBA").resize((1024, 96), Image.LANCZOS).save(OUT / "led-frame.png", optimize=True)
print("ok", (OUT / "led-frame.png").stat().st_size)
