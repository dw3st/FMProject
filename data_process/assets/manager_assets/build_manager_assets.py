"""The manager's purchases (home, car, watch; 4 levels each): vector layouts refined by FLUX.2 klein img2img, in the
facilities' style. Output: src/example_data/assets/manager-assets/<kind>-<level>.webp (640x400); one job at a time.

    python data_process/assets/manager_assets/build_manager_assets.py [car home watch] [--levels 1,2] [--regen] [--seed N]

Needs ComfyUI on http://127.0.0.1:8188 (see comfy.py)."""
from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import comfy  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "src" / "example_data" / "assets" / "manager-assets"
HERE = Path(__file__).resolve().parent
W, H = 1280, 800

STYLE = ("Polished stylized digital painting for a football manager video game, rich fine detail, believable materials and reflections, crisp edges, soft "
         "painterly lighting, rich colours, cohesive deep navy blue night palette with warm lamp light. Keep the exact "
         "composition, camera and layout of the reference. No text, no letters, no numbers, no logos, no badges, no "
         "people, no watermark.")

PROMPTS = {
    ("car", 1): "A modest used small three-door hatchback shaped like an older Volkswagen Golf, faded pale blue paint, detailed shading, parked on a plain city street at night, one single street lamp on the right, detailed buildings behind. Pure side view with the nose pointing left: headlight at the left end, red tail light at the right end, one single windscreen. An unbadged design.",
    ("car", 2): "A clean black executive four-door saloon shaped like a BMW 5 Series, parked on the paved driveway of a tidy house at dusk. Pure side view with the nose pointing left: headlight at the left end, red tail light at the right end, one single windscreen. An unbadged design.",
    ("car", 3): "A low red two-door rear-engined sports coupe shaped like a Porsche 911, round headlight, smooth sloping fastback rear with no spoiler and no wing, highly glossy reflective paint with detailed shading and highlights, in a modern lit garage with a polished floor. Pure side view with the nose pointing left: headlight at the left end, red tail light at the right end, one single windscreen. An unbadged design.",
    ("car", 4): "An extremely low wedge-shaped silver hypercar shaped like a Lamborghini Aventador, huge side air intakes, sharp angular lines, detailed shading and reflections on the paint, in a luxurious private showroom with strip lights and a mirror floor. Pure side view with the nose pointing left: headlight at the left end, red tail light at the right end, one single windscreen. An unbadged design.",
    ("home", 1): "A plain old five-storey city apartment block at night seen from across the street, worn concrete, small balconies with clothes lines, a few warm lit windows, a front door, street trees and a pavement.",
    ("home", 2): "A cosy two-storey family house with brick details, a pitched tiled roof, a chimney, a green front garden with flower beds, a low white fence and a big tree at dusk, warm windows.",
    ("home", 3): "A huge palatial white luxury mansion filling the whole width of the picture, a tall central block with a row of columns and a plain triangular pediment with no ornament, two long wings with many tall windows on each side, a wide stone staircase and a driveway at night, warmly lit from below.",
    ("home", 4): "The grandest billionaire penthouse on top of a skyscraper at night, two storeys of floor-to-ceiling lit glass with white marble balconies on both sides, a huge rooftop terrace with a long glowing turquoise infinity pool in the centre, palm trees in stone planters, a breathtaking view over a bay and a city skyline far below.",
    ("watch", 1): "A simple affordable steel wristwatch with a plain white dial with black batons and a brown stitched leather strap, lying at an angle on a dark wooden desk, sapphire glass reflection, macro close up.",
    ("watch", 2): "An elegant steel chronograph wristwatch with a deep blue sunburst dial, three small subdials, a tachymeter bezel and a brushed metal bracelet, lying at an angle on black leather, macro close up.",
    ("watch", 3): "A luxurious solid gold wristwatch with a champagne sunburst dial, applied gold indices and a heavy polished gold bracelet, lying at an angle on a royal blue velvet cushion, macro close up, gleaming highlights.",
    ("watch", 4): "An exquisite haute horlogerie skeleton wristwatch showing tiny golden gears through the dial, a bezel fully set with sparkling diamonds, a black alligator strap, lying at an angle inside an open wooden presentation case lined with black velvet, macro close up, dramatic light.",
}


def gradient(top, bottom, horizon=H):
    img = Image.new("RGB", (W, H), bottom)
    d = ImageDraw.Draw(img)
    for y in range(horizon):
        t = y / max(1, horizon - 1)
        d.line([(0, y), (W, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))
    return img


def glow(img, x, y, r, color, alpha=0.75):
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    ImageDraw.Draw(layer).ellipse([x - r, y - r, x + r, y + r], fill=color)
    layer = layer.filter(ImageFilter.GaussianBlur(r * 0.55))
    return Image.blend(img, Image.fromarray(__import__("numpy").clip(
        __import__("numpy").asarray(img, dtype="float32") + __import__("numpy").asarray(layer, dtype="float32"), 0, 255
    ).astype("uint8")), alpha)


def wheel(d, x, y, r, rim=(170, 175, 185), spokes=0):
    d.ellipse([x - r, y - r, x + r, y + r], fill=(14, 15, 20))
    rr = r * 0.62
    d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=rim)
    for i in range(spokes):
        a = i * 2 * math.pi / spokes
        d.line([(x, y), (x + rr * math.cos(a), y + rr * math.sin(a))], fill=(40, 42, 50), width=max(4, int(r * 0.1)))
    d.ellipse([x - r * 0.14, y - r * 0.14, x + r * 0.14, y + r * 0.14], fill=(50, 52, 60))


def smooth(points, passes=3):
    """Chaikin corner cutting: a car's outline without the polygon corners."""
    pts = list(points)
    for _ in range(passes):
        out = []
        for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
            out += [(x0 * 0.75 + x1 * 0.25, y0 * 0.75 + y1 * 0.25), (x0 * 0.25 + x1 * 0.75, y0 * 0.25 + y1 * 0.75)]
        pts = out
    return pts


# Side views, the nose always on the left: outline, side windows, door lines, headlight, tail light, wheels.
CARS = {
    1: {  # small hatchback in the shape of a VW Golf
        "body": [(285, 625), (288, 570), (340, 535), (480, 505), (590, 415), (800, 408), (905, 465), (950, 525), (955, 625)],
        "win": [[(510, 502), (600, 432), (690, 428), (690, 502)], [(708, 502), (708, 428), (795, 425), (880, 502)]],
        "doors": [700], "head": [(300, 548), (372, 532), (372, 556), (300, 570)], "tail": [(922, 505), (950, 512), (950, 556), (922, 556)],
        "wheels": [(420, 638, 62), (835, 638, 62)], "color": (112, 134, 158), "rim": (170, 175, 185), "spokes": 5,
    },
    2: {  # executive saloon in the shape of a BMW 5 Series
        "body": [(150, 625), (152, 572), (215, 545), (430, 512), (565, 425), (800, 420), (935, 502), (1085, 522), (1125, 560), (1128, 625)],
        "win": [[(455, 508), (575, 440), (680, 436), (680, 508)], [(698, 508), (698, 436), (795, 434), (905, 508)]],
        "doors": [690, 925], "head": [(165, 556), (255, 538), (255, 560), (165, 574)], "tail": [(1070, 524), (1124, 556), (1124, 580), (1070, 566)],
        "wheels": [(335, 640, 70), (950, 640, 70)], "color": (24, 30, 44), "rim": (150, 156, 168), "spokes": 5,
    },
    3: {  # rear-engined sports coupe in the shape of a Porsche 911
        "body": [(150, 628), (155, 580), (280, 545), (455, 510), (610, 425), (720, 420), (860, 470), (1010, 530), (1100, 565), (1110, 628)],
        "win": [[(480, 505), (610, 442), (680, 438), (680, 505)], [(698, 505), (698, 438), (735, 438), (835, 505)]],
        "doors": [690, 860], "head": [(175, 566), (255, 548), (255, 572), (175, 590)], "tail": [(1030, 538), (1104, 568), (1104, 590), (1030, 566)],
        "wheels": [(320, 642, 76), (945, 642, 76)], "color": (178, 26, 34), "rim": (46, 48, 56), "spokes": 7,
    },
    4: {  # mid-engined hypercar in the shape of a Lamborghini Aventador
        "body": [(95, 640), (130, 612), (420, 552), (590, 468), (700, 452), (850, 490), (1060, 545), (1175, 560), (1190, 640)],
        "win": [[(610, 472), (700, 462), (700, 545), (525, 545)]],
        "doors": [730], "head": [(135, 606), (265, 578), (265, 596), (150, 620)], "tail": [(1110, 552), (1185, 562), (1185, 582), (1110, 576)],
        "wheels": [(310, 642, 80), (1000, 642, 80)], "color": (188, 196, 208), "rim": (196, 166, 82), "spokes": 10,
    },
}


def draw_car(d, car):
    d.ellipse([120, 650, W - 120, 705], fill=(8, 10, 18))
    d.polygon(smooth(car["body"]), fill=car["color"])
    line = tuple(max(0, c - 34) for c in car["color"])
    for x in car["doors"]:
        d.line([(x, 500), (x, 615)], fill=line, width=4)
    for w in car["win"]:
        d.polygon(w, fill=(52, 72, 104))
    d.polygon(car["head"], fill=(248, 244, 214))
    d.polygon(car["tail"], fill=(214, 24, 30))
    for x, y, r in car["wheels"]:
        wheel(d, x, y, r, rim=car["rim"], spokes=car["spokes"])


def car_scene(level):
    if level == 1:
        img = gradient((16, 24, 48), (28, 36, 58), 540)
        d = ImageDraw.Draw(img)
        for x, w, h in [(40, 260, 300), (330, 200, 240), (560, 320, 330), (910, 340, 270)]:
            d.rectangle([x, 540 - h, x + w, 540], fill=(24, 32, 56))
            for wx in range(x + 24, x + w - 30, 60):
                for wy in range(540 - h + 28, 520, 62):
                    if (wx * wy) % 3 == 0:
                        d.rectangle([wx, wy, wx + 26, wy + 34], fill=(150, 120, 70))
        d.rectangle([0, 540, W, 590], fill=(66, 70, 82))
        d.rectangle([0, 590, W, H], fill=(38, 42, 54))
        d.rectangle([1090, 200, 1102, 590], fill=(30, 32, 40))
        d.rectangle([1000, 196, 1102, 208], fill=(30, 32, 40))
        draw_car(d, CARS[1])
        return glow(img, 1006, 210, 170, (150, 110, 50))
    if level == 2:
        img = gradient((30, 34, 70), (70, 62, 86), 500)
        d = ImageDraw.Draw(img)
        d.rectangle([700, 150, 1240, 500], fill=(70, 66, 74))
        d.polygon([(670, 160), (970, 50), (1270, 160)], fill=(44, 40, 52))
        d.rectangle([800, 240, 900, 340], fill=(214, 170, 90))
        d.rectangle([1040, 240, 1140, 340], fill=(214, 170, 90))
        d.rectangle([0, 470, W, 520], fill=(34, 62, 44))
        d.rectangle([0, 520, W, H], fill=(62, 64, 74))
        draw_car(d, CARS[2])
        return glow(img, 970, 290, 240, (160, 110, 50), 0.6)
    if level == 3:
        img = gradient((20, 24, 40), (34, 38, 52), 520)
        d = ImageDraw.Draw(img)
        for x in range(120, W, 260):
            d.rectangle([x, 70, x + 170, 88], fill=(240, 236, 220))
        d.rectangle([0, 520, W, H], fill=(52, 56, 68))
        draw_car(d, CARS[3])
        return img
    img = gradient((10, 12, 26), (16, 20, 38), 520)
    d = ImageDraw.Draw(img)
    for y in (90, 170, 250):
        d.rectangle([0, y, W, y + 8], fill=(150, 196, 255))
    d.rectangle([0, 520, W, H], fill=(26, 32, 50))
    draw_car(d, CARS[4])
    return glow(img, 640, 180, 300, (40, 70, 120), 0.6)


def home_scene(level):
    if level == 1:
        img = gradient((14, 22, 46), (30, 38, 64), 560)
        d = ImageDraw.Draw(img)
        for x, w, h in [(0, 230, 330), (1040, 240, 370)]:
            d.rectangle([x, 590 - h, x + w, 590], fill=(30, 36, 58))
            for wx in range(x + 20, x + w - 30, 58):
                for wy in range(590 - h + 24, 560, 66):
                    if (wx + wy) % 5 == 0:
                        d.rectangle([wx, wy, wx + 30, wy + 40], fill=(170, 134, 80))
        d.rectangle([270, 90, 1000, 610], fill=(96, 92, 100))
        d.rectangle([250, 74, 1020, 96], fill=(64, 62, 74))
        for fy in range(120, 490, 92):
            for fx in range(306, 950, 134):
                lit = (fx * 7 + fy) % 5 < 2
                d.rectangle([fx, fy, fx + 78, fy + 62], fill=(226, 176, 96) if lit else (40, 50, 74))
                d.rectangle([fx - 10, fy + 62, fx + 88, fy + 72], fill=(58, 58, 68))
        d.rectangle([570, 510, 700, 610], fill=(64, 46, 40))
        d.rectangle([0, 610, W, 660], fill=(92, 92, 102))
        d.rectangle([0, 660, W, H], fill=(40, 42, 54))
        for x in (120, 1160):
            d.rectangle([x - 8, 470, x + 8, 620], fill=(46, 34, 28))
            d.ellipse([x - 80, 340, x + 80, 500], fill=(28, 66, 44))
        return glow(img, 635, 540, 180, (140, 100, 50), 0.5)
    if level == 2:
        img = gradient((36, 40, 84), (102, 80, 96), 600)
        d = ImageDraw.Draw(img)
        d.rectangle([0, 590, W, H], fill=(42, 92, 56))
        d.rectangle([360, 300, 920, 610], fill=(196, 180, 158))
        d.polygon([(320, 310), (640, 120), (960, 310)], fill=(110, 58, 50))
        for x in (430, 730):
            d.rectangle([x, 370, x + 120, 480], fill=(232, 182, 96))
        d.rectangle([590, 470, 690, 610], fill=(82, 54, 44))
        d.rectangle([1040, 420, 1064, 620], fill=(60, 42, 34))
        d.ellipse([940, 240, 1170, 470], fill=(32, 76, 48))
        for x in range(60, W, 90):
            d.rectangle([x, 640, x + 16, 720], fill=(214, 208, 196))
        d.rectangle([0, 665, W, 680], fill=(214, 208, 196))
        return img
    if level == 3:
        img = gradient((10, 16, 42), (26, 34, 66), 560)
        d = ImageDraw.Draw(img)
        d.rectangle([0, 580, W, H], fill=(30, 56, 42))
        d.polygon([(500, H), (780, H), (690, 610), (590, 610)], fill=(150, 142, 128))
        # Two long wings, a tall central block and a raised roof: the whole width of the picture.
        d.polygon([(20, 250), (90, 190), (1190, 190), (1260, 250)], fill=(52, 58, 74))
        d.rectangle([40, 250, 1240, 600], fill=(226, 220, 206))
        d.polygon([(380, 130), (900, 130), (960, 210), (320, 210)], fill=(62, 68, 86))
        d.rectangle([390, 170, 890, 600], fill=(236, 230, 216))
        d.polygon([(370, 200), (640, 70), (910, 200)], fill=(214, 208, 194))
        for x in range(420, 860, 74):
            d.rectangle([x, 200, x + 24, 600], fill=(248, 242, 228))
        for x in list(range(70, 370, 74)) + list(range(930, 1220, 74)):
            for y in (280, 430):
                d.rectangle([x, y, x + 44, y + 88], fill=(236, 188, 104))
        d.rectangle([606, 460, 674, 600], fill=(90, 62, 44))
        d.polygon([(500, 640), (780, 640), (720, 600), (560, 600)], fill=(196, 190, 176))
        return glow(img, 640, 580, 420, (120, 90, 40), 0.5)
    img = gradient((6, 10, 36), (70, 56, 110), 400)
    d = ImageDraw.Draw(img)
    # The bay and the skyline far below, then a two-storey glass palace around a long pool.
    d.rectangle([0, 340, W, 470], fill=(14, 44, 88))
    for i in range(26):
        x = 10 + i * 49
        h = 40 + (i * 37) % 130
        d.rectangle([x, 340 - h, x + 40, 340], fill=(14, 20, 46))
        for y in range(340 - h + 8, 336, 16):
            d.rectangle([x + 7, y, x + 32, y + 6], fill=(226, 190, 118))
    for x0, x1 in ((0, 400), (880, W)):
        d.rectangle([x0, 80, x1, 520], fill=(44, 52, 76))
        d.rectangle([x0, 66, x1, 90], fill=(226, 224, 216))
        d.rectangle([x0, 290, x1, 306], fill=(226, 224, 216))
        for x in range(x0 + 16, x1 - 40, 96):
            for y0, y1 in ((104, 280), (316, 510)):
                d.rectangle([x, y0, x + 80, y1], fill=(244, 202, 126))
    d.polygon([(0, 520), (W, 520), (W, 800), (0, 800)], fill=(182, 176, 170))
    d.polygon([(260, 540), (1020, 540), (1120, 720), (160, 720)], fill=(30, 170, 190))
    d.polygon([(260, 540), (1020, 540), (1030, 552), (250, 552)], fill=(226, 226, 230))
    for x, flip in ((60, 1), (1220, -1)):
        d.rectangle([x - 34, 640, x + 34, 760], fill=(92, 88, 86))
        d.rectangle([x - 7, 380, x + 7, 650], fill=(70, 52, 40))
        for i in range(7):
            ang = -2.9 + i * 0.44
            d.line([(x, 380), (x + 130 * math.cos(ang), 380 + 90 * math.sin(ang) + 40)], fill=(24, 74, 50), width=20)
    return glow(img, 640, 300, 360, (130, 96, 40), 0.45)


def watch_scene(level):
    """A close-up on a surface: the watch drawn on its own layer, then turned so it does not lie flat in the frame."""
    surface = [(70, 42, 26), (30, 24, 26), (16, 26, 66), (10, 10, 18)][level - 1]
    img = gradient(tuple(c // 2 for c in surface), surface)
    d = ImageDraw.Draw(img)
    if level == 1:
        for y in range(40, H, 150):
            d.line([(0, y), (W, y + 30)], fill=(52, 30, 18), width=8)
    if level == 3:
        d.ellipse([230, 110, 1050, 720], fill=(26, 40, 92))
    if level == 4:
        d.rectangle([180, 40, 1100, 760], fill=(46, 28, 20))
        d.rectangle([210, 70, 1070, 730], fill=(18, 18, 26))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    w = ImageDraw.Draw(layer)
    cx, cy, r = 640, 400, 205
    strap = [(136, 82, 46), (156, 162, 174), (214, 172, 86), (24, 24, 32)][level - 1]
    side = 118
    for y0, y1 in ((-200, cy), (cy, H + 200)):
        w.rectangle([cx - side, y0, cx + side, y1], fill=strap)
    if level in (2, 3):
        for y in list(range(-200, cy - r, 40)) + list(range(cy + r, H + 200, 40)):
            w.rectangle([cx - side, y, cx + side, y + 6], fill=tuple(c // 2 for c in strap))
        for x in (cx - 40, cx + 40):
            w.line([(x, -200), (x, H + 200)], fill=tuple(c // 2 for c in strap), width=6)
    case = [(178, 182, 192), (204, 208, 218), (226, 186, 94), (232, 206, 136)][level - 1]
    dial = [(238, 236, 228), (18, 40, 92), (226, 204, 152), (20, 18, 22)][level - 1]
    w.rectangle([cx + r + 18, cy - 22, cx + r + 50, cy + 22], fill=case)
    w.ellipse([cx - r - 28, cy - r - 28, cx + r + 28, cy + r + 28], fill=case)
    w.ellipse([cx - r - 10, cy - r - 10, cx + r + 10, cy + r + 10], fill=tuple(int(c * 0.7) for c in case))
    w.ellipse([cx - r, cy - r, cx + r, cy + r], fill=dial)
    mark = (34, 34, 40) if level in (1, 3) else (232, 234, 242)
    if level == 4:
        for i in range(40):
            ang = i * math.pi / 20
            x, y = cx + (r + 19) * math.cos(ang), cy + (r + 19) * math.sin(ang)
            w.ellipse([x - 9, y - 9, x + 9, y + 9], fill=(240, 246, 255))
        for gx, gy, gr, n in [(-74, -62, 74, 12), (84, -34, 56, 10), (-22, 92, 66, 11), (112, 94, 36, 8)]:
            w.ellipse([cx + gx - gr, cy + gy - gr, cx + gx + gr, cy + gy + gr], outline=(216, 172, 82), width=12)
            for i in range(n):
                ang = i * 2 * math.pi / n
                w.line([(cx + gx, cy + gy), (cx + gx + gr * math.cos(ang), cy + gy + gr * math.sin(ang))], fill=(216, 172, 82), width=5)
    for i in range(12):
        ang = i * math.pi / 6
        length = 52 if level == 3 else 34
        w.line([(cx + (r - 14) * math.cos(ang), cy + (r - 14) * math.sin(ang)),
                (cx + (r - 14 - length) * math.cos(ang), cy + (r - 14 - length) * math.sin(ang))], fill=mark, width=9)
    if level == 2:
        for dx, dy in [(-92, 0), (92, 0), (0, 92)]:
            w.ellipse([cx + dx - 42, cy + dy - 42, cx + dx + 42, cy + dy + 42], outline=mark, width=5)
    w.line([(cx, cy), (cx + 96, cy - 74)], fill=mark, width=12)
    w.line([(cx, cy), (cx - 54, cy - 150)], fill=mark, width=8)
    w.ellipse([cx - 14, cy - 14, cx + 14, cy + 14], fill=case)
    layer = layer.rotate(-24, resample=Image.BICUBIC, center=(cx, cy))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    shadow.putalpha(layer.getchannel("A").point(lambda a: int(a * 0.55)))
    img = img.convert("RGBA")
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(20)), (24, 30))
    img.alpha_composite(layer)
    return img.convert("RGB")


SCENES = {"car": car_scene, "home": home_scene, "watch": watch_scene}


def main():
    args = sys.argv[1:]
    regen = "--regen" in args
    levels = [1, 2, 3, 4]
    seed = None
    strength = None
    kinds = []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--levels":
            levels = [int(x) for x in args[i + 1].split(",")]
            i += 1
        elif a == "--seed":
            seed = int(args[i + 1])
            i += 1
        elif a == "--strength":
            strength = float(args[i + 1])
            i += 1
        elif not a.startswith("--"):
            kinds.append(a)
        i += 1
    OUT.mkdir(parents=True, exist_ok=True)
    (HERE / "layouts").mkdir(exist_ok=True)
    for kind in kinds or list(SCENES):
        for level in levels:
            layout = SCENES[kind](level).filter(ImageFilter.GaussianBlur(1.2))
            layout.save(HERE / "layouts" / f"{kind}-{level}.png")
            prompt = f"{PROMPTS[(kind, level)]} {STYLE}"
            img = comfy.refine(f"mgr-{kind}-{level}", prompt, layout, seed if seed is not None else 200 + level, strength=strength or (0.62 if kind == "car" else 0.72), regen=regen)
            img = img.convert("RGB").resize((640, 400), Image.LANCZOS)
            img.save(OUT / f"{kind}-{level}.webp", quality=88, method=6)
            print("done", kind, level, flush=True)


if __name__ == "__main__":
    main()
