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

export interface CrowdAtlas {
  canvas: HTMLCanvasElement;
  /** Frames once the atlas texture exists (`bindAtlas`). */
  frames: { body: [Texture, Texture]; scarf: [Texture, Texture]; heads: Texture[] } | null;
  /** Frame rectangles: body down/up, scarf down/up, then heads (skin × (HAIRS + bald + cap)). */
  rects: Rectangle[];
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
  return { canvas, frames: null, rects };
}

/** Cuts the frames out of the atlas texture source. */
export function bindAtlas(atlas: CrowdAtlas, source: CanvasSource): NonNullable<CrowdAtlas["frames"]> {
  const t = (r: Rectangle) => new Texture({ source, frame: r });
  const frames = {
    body: [t(atlas.rects[0]!), t(atlas.rects[1]!)] as [Texture, Texture],
    scarf: [t(atlas.rects[2]!), t(atlas.rects[3]!)] as [Texture, Texture],
    heads: atlas.rects.slice(4).map(t),
  };
  atlas.frames = frames;
  return frames;
}

/** Index of a head frame. */
export function headFrame(skin: number, hair: number): number {
  return skin * (CROWD_MOTION.HAIRS + 2) + hair;
}
