"""Contact sheet of the casino symbols on the UI's card colour: python -I contact_sheet.py <out.png>"""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
DIR = ROOT / "src" / "example_data" / "assets" / "casino"
files = sorted(DIR.glob("sym-*.webp"))
cell = 280
cols = 5
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * cell * 2, rows * cell + 20), (17, 22, 34))
for i, f in enumerate(files):
    im = Image.open(f).convert("RGBA")
    if im.width > 256:
        im = im.resize((cell * 2 - 40, round(im.height * (cell * 2 - 40) / im.width)), Image.LANCZOS)
    tile = Image.new("RGB", (cell - 16, cell - 16), (24, 30, 44) if i % 2 == 0 else (34, 40, 56))
    tile.paste(im.resize((min(im.width, cell - 40), round(im.height * min(im.width, cell - 40) / im.width))),
               (12, 12), im.resize((min(im.width, cell - 40), round(im.height * min(im.width, cell - 40) / im.width))))
    sheet.paste(tile, ((i % cols) * cell + 8, (i // cols) * cell + 18))
    # small size check (96 px) next to it
    sm = im.resize((96, round(im.height * 96 / im.width)), Image.LANCZOS)
    sheet.paste(sm, (cols * cell + (i % cols) * cell + 90, (i // cols) * cell + 90), sm)
sheet.save(sys.argv[1])
print(sys.argv[1], len(files))
