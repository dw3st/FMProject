/**
 * The crowd's figures (4.38.12): one atlas canvas with every frame a fan is made of, so the whole crowd renders in a
 * ParticleContainer (one texture source). Frames are drawn in a FRAME × FRAME box with the figure's feet at FOOT:
 * the body (white, tinted to the shirt colour per fan), arms down and up; the scarf (home colours), down and up; and
 * the heads (skin × hair, cap in the home colour). Canvas 2D only; built at every crowd bake.
 */
import { Rectangle, Texture, type CanvasSource } from "pixi.js";
import { CROWD_MOTION } from "@/GraficsEngine/crowdMotion";

/** Frame side (px) and where the figure stands in it (anchor), figure scale inside the frame. */
export const FIGURE_FRAME = { SIZE: 40, FOOT_Y: 35, SCALE: 26 } as const;

const SKIN = ["#f1c9a5", "#e0ac83", "#c68b5e", "#9b6a42", "#6f4527", "#4a2c17"];
const HAIR = ["#1b1410", "#3a2616", "#6b4423", "#a8742f", "#d8c08a", "#2b2b2b", "#777777"];

/** The art crowd's frames (art phase 4, `src/example_data/assets/crowd`): 24 px, the figure's feet at the bottom. */
export const ART_FIGURE_FRAME = { SIZE: 24, FOOT_Y: 23, SCALE: 21 } as const;

/** A fan's pose: arms down, arms up, hands on the head (the side that conceded). */
export type FanArms = 0 | 1 | 2;

export interface CrowdAtlas {
  canvas: HTMLCanvasElement;
  /** Frames once the atlas texture exists (`bindAtlas`); `body` and `scarf` per pose (the scarf has no head pose). */
  frames: { body: Texture[]; scarf: [Texture, Texture]; heads: Texture[] } | null;
  /** Frame rectangles: bodies, scarves down/up, then heads. */
  rects: Rectangle[];
  /** Frame geometry (side, feet, figure scale). */
  frame: { SIZE: number; FOOT_Y: number; SCALE: number };
  /** Body frames (2: down/up; 3 with the hands-on-head pose). */
  bodies: number;
  /** Index of a head frame: the art heads carry the arms, so they change with the pose. */
  headIndex: (skin: number, hair: number, arms: FanArms) => number;
}

const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** Draws every frame into one canvas. `home` and `homeAlt` colour the scarves and caps. */
export function buildCrowdAtlas(home: number, homeAlt: number): CrowdAtlas {
  const F = FIGURE_FRAME.SIZE, s = FIGURE_FRAME.SCALE, x = F / 2, y = FIGURE_FRAME.FOOT_Y - 0.42 * s;
  const headCount = CROWD_MOTION.SKINS * (CROWD_MOTION.HAIRS + 2);
  const total = 4 + headCount;
  const cols = 8, rows = Math.ceil(total / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * F;
  canvas.height = rows * F;
  const g = canvas.getContext("2d")!;
  const rects: Rectangle[] = [];
  const at = (i: number) => { const r = new Rectangle((i % cols) * F, Math.floor(i / cols) * F, F, F); rects.push(r); return r; };

  // Body: torso with shoulders (white, a shaded right side so the tint keeps some volume); arms up in the second frame.
  for (let up = 0; up < 2; up++) {
    const r = at(up);
    g.save(); g.translate(r.x, r.y);
    if (up) {
      g.strokeStyle = "#e9e9e9"; g.lineWidth = s * 0.16; g.lineCap = "round";
      for (const side of [-1, 1]) {
        g.beginPath(); g.moveTo(x + side * s * 0.28, y + s * 0.05); g.lineTo(x + side * s * 0.46, y - s * 0.75); g.stroke();
      }
    }
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(x - s * 0.34, y + s * 0.42); g.lineTo(x - s * 0.34, y + s * 0.08);
    g.quadraticCurveTo(x - s * 0.34, y - s * 0.06, x - s * 0.16, y - s * 0.08);
    g.lineTo(x + s * 0.16, y - s * 0.08);
    g.quadraticCurveTo(x + s * 0.34, y - s * 0.06, x + s * 0.34, y + s * 0.08);
    g.lineTo(x + s * 0.34, y + s * 0.42); g.closePath(); g.fill();
    g.fillStyle = "rgba(0,0,0,.16)"; g.fillRect(x + s * 0.12, y, s * 0.22, s * 0.42);
    g.restore();
  }
  // Scarf: round the neck, then held up over the head.
  for (let up = 0; up < 2; up++) {
    const r = at(2 + up);
    g.save(); g.translate(r.x, r.y);
    if (up) {
      const lx = x - s * 0.5, rx = x + s * 0.5, sy = y - s * 0.78;
      g.fillStyle = css(home); g.fillRect(lx, sy - s * 0.07, rx - lx, s * 0.14);
      g.fillStyle = css(homeAlt);
      for (let k = 0; k < 4; k++) g.fillRect(lx + (rx - lx) * (k * 2 + 1) / 8, sy - s * 0.07, (rx - lx) / 8, s * 0.14);
    } else {
      g.fillStyle = css(home); g.fillRect(x - s * 0.18, y - s * 0.1, s * 0.36, s * 0.1);
      g.fillStyle = css(homeAlt); g.fillRect(x - s * 0.06, y - s * 0.1, s * 0.12, s * 0.1);
    }
    g.restore();
  }
  // Heads: skin, then hair (HAIRS colours), bald, a cap in the home colour.
  for (let sk = 0; sk < CROWD_MOTION.SKINS; sk++) {
    for (let h = 0; h < CROWD_MOTION.HAIRS + 2; h++) {
      const r = at(4 + sk * (CROWD_MOTION.HAIRS + 2) + h);
      g.save(); g.translate(r.x, r.y);
      g.fillStyle = SKIN[sk]!; g.beginPath(); g.arc(x, y - s * 0.26, s * 0.17, 0, Math.PI * 2); g.fill();
      if (h === CROWD_MOTION.HAIRS + 1) {
        g.fillStyle = css(home); g.beginPath(); g.arc(x, y - s * 0.3, s * 0.18, Math.PI, 0); g.fill();
        g.fillRect(x - s * 0.02, y - s * 0.32, s * 0.24, s * 0.05);
      } else if (h < CROWD_MOTION.HAIRS) {
        g.fillStyle = HAIR[h]!; g.beginPath(); g.arc(x, y - s * 0.3, s * 0.175, Math.PI * 1.05, Math.PI * 1.95); g.fill();
      }
      g.restore();
    }
  }
  return { canvas, frames: null, rects, frame: FIGURE_FRAME, bodies: 2, headIndex: (skin, hair) => skin * (CROWD_MOTION.HAIRS + 2) + hair };
}

/** A frame of the art crowd atlas: the image and the frame's rectangle. */
export interface ArtCrowdSheet {
  image: CanvasImageSource;
  frames: Record<string, { x: number; y: number; w: number; h: number }>;
}

/**
 * The crowd's atlas from the art pieces (art phase 4): the same layout as `buildCrowdAtlas` (one canvas, one texture
 * source, so each side stays one ParticleContainer), with the painted pieces composited. Bodies white (tinted per fan),
 * scarves in the home colour, heads = skin with the arms of the pose + hair (style and colour by the fan's hair index),
 * bald, or a cap in the home colour.
 */
export function buildArtCrowdAtlas(sheet: ArtCrowdSheet, home: number): CrowdAtlas {
  const F = ART_FIGURE_FRAME.SIZE;
  const H = CROWD_MOTION.HAIRS + 2;
  const heads = 3 * CROWD_MOTION.SKINS * H;
  const total = 3 + 2 + heads;
  const cols = 16, rows = Math.ceil(total / cols);
  const canvas = document.createElement("canvas");
  canvas.width = cols * F;
  canvas.height = rows * F;
  const g = canvas.getContext("2d")!;
  const rects: Rectangle[] = [];
  const at = (i: number) => { const r = new Rectangle((i % cols) * F, Math.floor(i / cols) * F, F, F); rects.push(r); return r; };
  const piece = (name: string, r: Rectangle, tint?: string) => {
    const f = sheet.frames[`${name}.png`];
    if (!f) return;
    if (!tint) { g.drawImage(sheet.image, f.x, f.y, f.w, f.h, r.x, r.y, F, F); return; }
    const t = document.createElement("canvas");
    t.width = t.height = F;
    const tg = t.getContext("2d")!;
    tg.drawImage(sheet.image, f.x, f.y, f.w, f.h, 0, 0, F, F);
    tg.globalCompositeOperation = "multiply";
    tg.fillStyle = tint;
    tg.fillRect(0, 0, F, F);
    tg.globalCompositeOperation = "destination-in";
    tg.drawImage(sheet.image, f.x, f.y, f.w, f.h, 0, 0, F, F);
    g.drawImage(t, r.x, r.y);
  };
  const POSES = ["down", "up", "head"] as const;
  POSES.forEach((p, i) => piece(`crowd-body-${p}`, at(i)));
  piece("crowd-scarf-down", at(3), css(home));
  piece("crowd-scarf-up", at(4), css(home));
  POSES.forEach((p, pi) => {
    const base = p === "head" ? "down" : p;
    for (let sk = 0; sk < CROWD_MOTION.SKINS; sk++) {
      for (let h = 0; h < H; h++) {
        const r = at(5 + (pi * CROWD_MOTION.SKINS + sk) * H + h);
        piece(`crowd-skin-${sk + 1}-${base}`, r);
        if (h === CROWD_MOTION.HAIRS + 1) piece("crowd-cap", r, css(home));
        else if (h < CROWD_MOTION.HAIRS) piece(`crowd-hair-0${(h % 7) + 1}`, r, HAIR[h]!);
        if (p === "head") piece(`crowd-hands-${sk + 1}-head`, r);
      }
    }
  });
  return {
    canvas, frames: null, rects, frame: ART_FIGURE_FRAME, bodies: 3,
    headIndex: (skin, hair, arms) => (arms * CROWD_MOTION.SKINS + skin) * H + hair,
  };
}

/** Cuts the frames out of the atlas texture source. */
export function bindAtlas(atlas: CrowdAtlas, source: CanvasSource): NonNullable<CrowdAtlas["frames"]> {
  const t = (r: Rectangle) => new Texture({ source, frame: r });
  const n = atlas.bodies;
  const frames = {
    body: atlas.rects.slice(0, n).map(t),
    scarf: [t(atlas.rects[n]!), t(atlas.rects[n + 1]!)] as [Texture, Texture],
    heads: atlas.rects.slice(n + 2).map(t),
  };
  atlas.frames = frames;
  return frames;
}
