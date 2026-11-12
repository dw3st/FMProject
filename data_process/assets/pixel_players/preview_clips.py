"""Contact sheet of the pixel players' atlas: every clip, frame by frame, tinted as the game tints it.

    python -I data_process/assets/pixel_players/preview_clips.py <dir with the atlas> <out.png> [clip ...]

Checks the build by eye: the right frames in each clip, the layers in place, the tints.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ZOOM = 3
CELL_W, CELL_H = 64, 46
FEET = (30, 40)
KITS = [
    {"shirt": 0xD22630, "shorts": 0xF4F4F4, "socks": 0xD22630, "skin": 0xE0AC83, "hair": 0x1B1410, "boots": 0x2A2A30, "style": "hair1"},
    {"shirt": 0x1B2A6B, "shorts": 0x1B2A6B, "socks": 0xF4F4F4, "skin": 0x6F4527, "hair": 0x2B2B2B, "boots": 0xD7F23A, "style": "hair3"},
]


def tint_of(layer, kit):
    if layer in kit:
        return kit[layer]
    if layer.startswith("hair"):
        return kit["hair"] if layer == kit["style"] else None
    return 0xFFFFFF


def main():
    src, out = sys.argv[1], sys.argv[2]
    pointer = json.load(open(os.path.join(src, "pixel-players.json"), encoding="utf-8"))
    data = json.load(open(os.path.join(src, os.path.basename(pointer["data"])), encoding="utf-8"))
    atlas = np.asarray(Image.open(os.path.join(src, os.path.basename(data["image"]))).convert("RGBA")).astype(np.float32)
    names = sys.argv[3:] or list(data["clips"])
    cols = max(len(data["clips"][n]["frames"]) for n in names)
    sheet = Image.new("RGBA", (110 + cols * CELL_W * ZOOM, len(names) * CELL_H * ZOOM), (46, 82, 50, 255))
    draw = ImageDraw.Draw(sheet)
    for row, name in enumerate(names):
        clip = data["clips"][name]
        kit = KITS[row % len(KITS)]
        draw.text((4, row * CELL_H * ZOOM + 4), f"{name}\n{len(clip['frames'])} x {clip['dur']}s" + ("\nloop" if clip.get("loop") else ""), fill=(255, 255, 120, 255))
        for col, f in enumerate(clip["frames"]):
            cell = np.zeros((CELL_H, CELL_W, 4), dtype=np.float32)
            parts = data["frames"][f]
            for i in range(0, len(parts), 4):
                layer, rect, ox, oy = data["layers"][parts[i]], data["rects"][parts[i + 1]], parts[i + 2], parts[i + 3]
                tint = tint_of(layer, kit)
                if tint is None:
                    continue
                x, y, w, h = rect
                piece = atlas[y:y + h, x:x + w].copy()
                piece[..., 0] *= ((tint >> 16) & 255) / 255
                piece[..., 1] *= ((tint >> 8) & 255) / 255
                piece[..., 2] *= (tint & 255) / 255
                cx, cy = FEET[0] + ox, FEET[1] + oy
                x0, y0, x1, y1 = max(0, cx), max(0, cy), min(CELL_W, cx + w), min(CELL_H, cy + h)
                if x1 <= x0 or y1 <= y0:
                    continue
                sub = piece[y0 - cy:y1 - cy, x0 - cx:x1 - cx]
                a = sub[..., 3:4] / 255
                cell[y0:y1, x0:x1, :3] = sub[..., :3] * a + cell[y0:y1, x0:x1, :3] * (1 - a)
                cell[y0:y1, x0:x1, 3:4] = np.maximum(cell[y0:y1, x0:x1, 3:4], sub[..., 3:4])
            img = Image.fromarray(cell.astype(np.uint8), "RGBA").resize((CELL_W * ZOOM, CELL_H * ZOOM), Image.NEAREST)
            sheet.alpha_composite(img, (110 + col * CELL_W * ZOOM, row * CELL_H * ZOOM))
            draw.text((112 + col * CELL_W * ZOOM, row * CELL_H * ZOOM + 2), str(f), fill=(220, 220, 220, 255))
    sheet.save(out)
    print(out, sheet.size)


if __name__ == "__main__":
    main()
