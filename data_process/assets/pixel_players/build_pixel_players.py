"""Pixel-art players of the live match (10.7), from the bought pack "Goals in Pixels" (n3cloud, itch.io).

Reads the pack's .aseprite sources (players and goalkeeper), splits every frame into tint layers (skin, socks, boots,
shorts, shirt, gloves, five hair styles, VFX), turns the tintable ones into greys (the game multiplies them by the
kit, skin and hair colours), trims and de-duplicates the pieces and packs them into one atlas, with the description
the game reads (`parsePixelAtlas`, src/Domain/art/pixelSprite.ts).

The pack may not be redistributed: sources and output stay out of git (fmproject-art-handoff/ and src/Data/ are
ignored). The output goes to the art volume: `art/sprites/`.

    python -I data_process/assets/pixel_players/build_pixel_players.py <pack dir> <out dir> [<out dir> ...]

A changed atlas needs a new NAME below: the art URLs are cached forever.
"""
import hashlib
import importlib.util
import json
import os
import sys

import numpy as np
from PIL import Image

NAME = "goals-in-pixels-1"
ATLAS_W = 512
PAD = 1

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("ase", os.path.join(HERE, "ase.py"))
ase = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ase)

LAYERS = ["skin", "socks", "boots", "shorts", "shirt", "gloves", "hair0", "hair1", "hair2", "hair3", "hair4", "vfx"]

# Source layer -> atlas layer, per file. The keeper has four hair styles: the fifth reuses his first.
PLAYER_LAYERS = {"body": "skin", "socks": "socks", "boots": "boots", "short": "shorts", "jersey": "shirt",
                 "Hair": "hair0", "Hair2": "hair1", "Hair3": "hair2", "Hair4": "hair3", "Hair5": "hair4", "VFX": "vfx"}
KEEPER_LAYERS = {"body": "skin", "socks": "socks", "boots": "boots", "short": "shorts", "jersey": "shirt",
                 "gloves": "gloves", "Hair": "hair0", "Hair2": "hair1", "Hair3": "hair2", "Hair4": "hair3", "VFX": "vfx"}

# Greys of the tintable layers: the pack's shades, lightest = white, so a multiply by the game's colour keeps them.
GREYS = {
    "skin": {0xfdcbb0: 255, 0xfca790: 238, 0xf68181: 204, 0xf04f78: 168},
    "boots": {0xed8099: 255, 0xcf657f: 214, 0xa24b6f: 165, 0x3e3546: 92},
    "shorts": {0xffffff: 255, 0xc7dcd0: 216},
    "shirt": {0xffffff: 255, 0xc7dcd0: 216},
    "socks": {0xffffff: 255},
}
SKIN_TONES = set(GREYS["skin"])


def normalise(layer, px):
    """A layer's pixels ready for tinting. Gloves keep the pack's colours; hair and VFX become flat white."""
    out = px.copy()
    a = px[..., 3] > 0
    rgb = (px[..., 0].astype(np.int64) << 16) | (px[..., 1].astype(np.int64) << 8) | px[..., 2]
    if layer == "gloves":
        return out
    if layer.startswith("hair"):
        # A few stray skin pixels sit in the hair layers: dropped.
        stray = a & np.isin(rgb, list(SKIN_TONES))
        out[stray] = 0
        keep = a & ~stray
        out[keep, 0:3] = 255
        return out
    if layer == "vfx":
        out[a, 0:3] = 255
        return out
    table = GREYS[layer]
    luma = (0.2126 * px[..., 0] + 0.7152 * px[..., 1] + 0.0722 * px[..., 2])
    top = max(0.2126 * (c >> 16) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255) for c in table)
    grey = np.clip(np.round(luma / top * 255), 0, 255).astype(np.uint8)
    for c, g in table.items():
        grey[rgb == c] = g
    for ch in range(3):
        out[..., ch] = np.where(a, grey, 0)
    return out


def anchor_of(src):
    """The feet of the standing figure (first idle frame): centre x of the boots, one pixel under their soles."""
    px = src.cel(src.tag("idle")["from"], src.layer_index("boots"))
    ys, xs = np.nonzero(px[..., 3] > 0)
    return int(round((xs.min() + xs.max() + 1) / 2)), int(ys.max() + 1)


def build():
    pack = sys.argv[1]
    outs = sys.argv[2:]
    assert outs, "an output directory is expected"
    player = ase.Ase(os.path.join(pack, "characters", "players", "character.aseprite"))
    keeper = ase.Ase(os.path.join(pack, "characters", "goalkeeper", "goalkeeper.aseprite"))

    pieces, piece_index = [], {}     # unique trimmed images
    frames = []                      # per frame: flat [layer, piece, ox, oy, ...]

    def add_source(src, mapping):
        ax, ay = anchor_of(src)
        base = len(frames)
        idx = {name: src.layer_index(name) for name in mapping}
        for f in range(len(src.frames)):
            parts = []
            by_layer = {}
            for name, layer in mapping.items():
                px = normalise(layer, src.cel(f, idx[name]))
                m = px[..., 3] > 0
                if not m.any():
                    continue
                ys, xs = np.nonzero(m)
                x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
                crop = np.ascontiguousarray(px[y0:y1, x0:x1])
                key = hashlib.sha1(crop.tobytes() + bytes([crop.shape[0] & 255, crop.shape[1] & 255])).hexdigest()
                if key not in piece_index:
                    piece_index[key] = len(pieces)
                    pieces.append(crop)
                by_layer[layer] = (piece_index[key], int(x0 - ax), int(y0 - ay))
            if "hair4" not in by_layer and "hair0" in by_layer and src is keeper:
                by_layer["hair4"] = by_layer["hair0"]
            for layer in LAYERS:
                if layer in by_layer:
                    p, ox, oy = by_layer[layer]
                    parts += [LAYERS.index(layer), p, ox, oy]
            frames.append(parts)
        return base, (ax, ay)

    p0, p_anchor = add_source(player, PLAYER_LAYERS)
    k0, k_anchor = add_source(keeper, KEEPER_LAYERS)

    # Shelf packing, tallest first.
    order = sorted(range(len(pieces)), key=lambda i: (-pieces[i].shape[0], -pieces[i].shape[1]))
    rects = [None] * len(pieces)
    x = y = shelf = 0
    for i in order:
        h, w = pieces[i].shape[:2]
        if x + w + PAD > ATLAS_W:
            x, y, shelf = 0, y + shelf + PAD, 0
        rects[i] = [x, y, w, h]
        x += w + PAD
        shelf = max(shelf, h)
    atlas_h = y + shelf
    atlas = np.zeros((atlas_h, ATLAS_W, 4), dtype=np.uint8)
    for i, (rx, ry, w, h) in enumerate(rects):
        atlas[ry:ry + h, rx:rx + w] = pieces[i]

    P = lambda *fs: [p0 + f for f in fs]
    K = lambda *fs: [k0 + f for f in fs]
    R = lambda a, b: list(range(a, b + 1))
    clip = lambda fr, dur, loop=False: {"frames": fr, "dur": dur, **({"loop": True} if loop else {})}
    clips = {
        # Gait: idle by time; walk and run by the stride (their `dur` is not read).
        "idle": clip(P(*R(0, 4)), 0.16, True),
        "walk": clip(P(*R(15, 20)), 0.1, True),
        "run": clip(P(*R(29, 34)), 0.1, True),
        "walkBall": clip(P(*R(23, 28)), 0.1, True),
        "runBall": clip(P(*R(35, 40)), 0.1, True),
        "stance": clip(P(*R(61, 64)), 0.14, True),
        # Actions (their length follows the game's action times, `actionChain`).
        "kick": clip(P(77, 78, 79, 80, 81, 82, 83, 84), 0.07),
        "pass": clip(P(78, 79, 81, 83), 0.075),         # without the shot's big swoosh (frame 80)
        "volley": clip(P(95, 96, 97, 98, 99, 100, 101), 0.08),
        "rabona": clip(P(*R(86, 93)), 0.07),
        "bicycle": clip(P(104, 105, 106, 107, 108, 109, 109, 109, 75, 76), 0.085),
        "header": clip(P(*R(44, 51)), 0.0625),
        "tackle": clip(P(71, 72, 73, 74, 73, 74, 75, 76), 0.1),
        "tackleStand": clip(P(*R(65, 70)), 0.058),
        "fall": clip(P(107, 108, 109, 109, 109, 109, 109, 109, 109, 109, 75, 76), 0.1),
        "down": clip(P(108, 109), 0.4),
        "receive": clip(P(21, 22), 0.11),
        "celebrate": clip(P(*R(185, 193)), 0.11, True),
        "kneeSlide": clip(P(72, 73, 74, 73, 74, 73, 74, 75, 76, 186, 187, 188, 189, 190, 191, 192, 193), 0.11),
        "throwHold": clip(P(189), 0.5, True),
        "throwGo": clip(P(188, 190), 0.17),
        # Dribble tricks (a won dribble).
        "roulette": clip(P(*R(126, 132)), 0.08),
        "hocusPocus": clip(P(*R(133, 137)), 0.09),
        "rivelino": clip(P(*R(138, 144)), 0.08),
        # Goalkeeper.
        "keeperIdle": clip(K(*R(0, 4)), 0.16, True),
        "keeperReady": clip(K(*R(15, 18)), 0.14, True),
        "keeperWalk": clip(K(*R(19, 24)), 0.1, True),
        "diveDown": clip(K(27, 28, 29, 30, 30, 31, 32, 33, 34, 34, 34, 34, 34, 34), 0.1),
        "diveUp": clip(K(37, 38, 39, 40, 40, 41, 42, 43, 44, 45, 45, 45, 45, 45), 0.1),
        "catch": clip(K(*R(46, 50)), 0.1),
        "punch": clip(K(37, 38, 39, 40), 0.1),
        "throw": clip(K(54, 55, 56, 57, 58, 59, 60), 0.065),
        "keeperKick": clip(K(55, 56, 57, 58, 59, 60), 0.09),
        "keeperPass": clip(K(56, 57, 58, 59), 0.075),
    }

    # The standing figure (first idle frame, with the tallest everyday hair): what sits over the head follows it.
    stand = np.zeros((player.h, player.w), dtype=bool)
    for name in ("body", "jersey", "short", "socks", "boots", "Hair2"):
        stand |= player.cel(0, player.layer_index(name))[..., 3] > 0
    ys, xs = np.nonzero(stand)
    body, height = int(xs.max() - xs.min() + 1), int(p_anchor[1] - ys.min())

    data = {"v": 1, "image": f"sprites/{NAME}.png", "body": body, "height": height, "layers": LAYERS,
            "rects": rects, "frames": frames, "clips": clips}
    pointer = {"data": f"sprites/{NAME}.json"}
    for out in outs:
        os.makedirs(out, exist_ok=True)
        Image.fromarray(atlas, "RGBA").save(os.path.join(out, f"{NAME}.png"), optimize=True)
        with open(os.path.join(out, f"{NAME}.json"), "w", encoding="utf-8") as fh:
            json.dump(data, fh, separators=(",", ":"))
        with open(os.path.join(out, "pixel-players.json"), "w", encoding="utf-8") as fh:
            json.dump(pointer, fh)
    print(f"frames {len(frames)} (players {p0}.., keeper {k0}..), pieces {len(pieces)}, atlas {ATLAS_W}x{atlas_h}, "
          f"anchors player {p_anchor} keeper {k_anchor}, body {body} height {height}")


if __name__ == "__main__":
    build()
