/** Pixi drawing of the pitch effects and the ball trail (state lives in pitchEffects.ts). */
import type { Graphics } from "pixi.js";
import { EFFECT_COLOR, TRAIL } from "@/GraficsEngine/pitchStyle";
import { effectAlpha, effectProgress, type PitchEffect, type TrailPoint } from "@/GraficsEngine/pitchEffects";
import { GOAL_Y_MIN, GOAL_Y_MAX, PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";

export interface EffectCtx {
  toPixel: (x: number, y: number) => { px: number; py: number };
  scale: number;       // px per yard
  markerR: number;     // marker radius px
  netDepth: number;    // goal net depth px
}

function dashed(g: Graphics, x1: number, y1: number, x2: number, y2: number, color: number, alpha: number, width = 2) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len === 0) return;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
  for (let d = 0; d < len; d += 10) {
    const e = Math.min(len, d + 6);
    g.moveTo(x1 + ux * d, y1 + uy * d).lineTo(x1 + ux * e, y1 + uy * e);
  }
  g.stroke({ width, color, alpha });
}

export function drawTrail(g: Graphics, points: readonly TrailPoint[], now: number, ctx: EffectCtx) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    const age = now - b.at;
    const alpha = TRAIL.ALPHA * Math.max(0, 1 - age / TRAIL.SECONDS) * (i / points.length);
    if (alpha <= 0) continue;
    const pa = ctx.toPixel(a.x, a.y), pb = ctx.toPixel(b.x, b.y);
    g.moveTo(pa.px, pa.py).lineTo(pb.px, pb.py).stroke({ width: TRAIL.WIDTH, color: 0xffffff, alpha, cap: "round" });
  }
}

export function drawEffect(g: Graphics, e: PitchEffect, now: number, ctx: EffectCtx) {
  const a = effectAlpha(e, now);
  const p = effectProgress(e, now);
  const R = ctx.markerR;
  switch (e.kind) {
    case "shot": {
      const from = ctx.toPixel(e.fromX, e.fromY), to = ctx.toPixel(e.toX, e.toY);
      dashed(g, from.px, from.py, to.px, to.py, EFFECT_COLOR.HIGHLIGHT, a);
      g.circle(to.px, to.py, R * 0.5 * (1 + p)).stroke({ width: 2, color: EFFECT_COLOR.HIGHLIGHT, alpha: a });
      g.circle(to.px, to.py, R * (1 + p)).stroke({ width: 2, color: EFFECT_COLOR.HIGHLIGHT, alpha: a * 0.6 });
      return;
    }
    case "goal": {
      const top = ctx.toPixel(e.goalX, GOAL_Y_MIN), bot = ctx.toPixel(e.goalX, GOAL_Y_MAX);
      const outward = e.goalX > PITCH_LENGTH / 2 ? 1 : -1; // right goal bulges right
      const bulge = ctx.netDepth * (1 + 0.8 * Math.sin(Math.PI * p)) * outward;
      g.moveTo(top.px, top.py).quadraticCurveTo(top.px + bulge * 1.6, (top.py + bot.py) / 2, bot.px, bot.py)
        .stroke({ width: 2, color: EFFECT_COLOR.WHITE, alpha: a });
      const mouth = ctx.toPixel(e.goalX, e.goalY);
      for (let i = 0; i < 12; i++) {
        const ang = Math.PI / 2 + (i / 11 - 0.5) * Math.PI * 0.9;      // fan towards the pitch
        const dist = (R * 2 + (i % 4) * R * 0.8) * p;
        const x = mouth.px - outward * Math.sin(ang) * dist;
        const y = mouth.py - Math.cos(ang) * dist * 1.2;
        g.circle(x, y, 2.5).fill({ color: i % 3 === 0 ? EFFECT_COLOR.WHITE : e.color, alpha: a });
      }
      return;
    }
    case "foul": {
      const { px, py } = ctx.toPixel(e.x, e.y);
      const s = R * 0.6;
      g.moveTo(px - s, py - s).lineTo(px + s, py + s).moveTo(px + s, py - s).lineTo(px - s, py + s)
        .stroke({ width: 3, color: EFFECT_COLOR.WHITE, alpha: a });
      return;
    }
    case "card": {
      const { px, py } = ctx.toPixel(e.x, e.y);
      const cx = px, cy = py - R * 1.8 - p * R;
      const w = R * 0.7, h = R;
      const ang = 0.35 * Math.sin(p * Math.PI * 2);
      const cos = Math.cos(ang), sin = Math.sin(ang);
      const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
        .flatMap(([x, y]) => [cx + x! * cos - y! * sin, cy + x! * sin + y! * cos]);
      g.poly(corners).fill({ color: e.card === "red" ? EFFECT_COLOR.RED_CARD : 0xffd400, alpha: a })
        .stroke({ width: 1, color: 0x000000, alpha: 0.4 * a });
      return;
    }
    case "offside": {
      const { px, py } = ctx.toPixel(e.x, e.y);
      if (e.lineX !== null) {
        const t = ctx.toPixel(e.lineX, 0), b = ctx.toPixel(e.lineX, PITCH_WIDTH);
        dashed(g, t.px, t.py, b.px, b.py, EFFECT_COLOR.HIGHLIGHT, a);
      }
      g.circle(px, py, R * 1.4).stroke({ width: 2, color: EFFECT_COLOR.HIGHLIGHT, alpha: a });
      return;
    }
  }
}

/** Where an effect's text goes (px), or null when it has none. */
export function effectTextAnchor(e: PitchEffect, now: number, ctx: EffectCtx): { x: number; y: number } | null {
  const R = ctx.markerR;
  switch (e.kind) {
    case "shot": { const to = ctx.toPixel(e.toX, e.toY); return { x: to.px, y: to.py - R * 2.4 }; }
    case "card": { const { px, py } = ctx.toPixel(e.x, e.y); return { x: px, y: py - R * 3 - effectProgress(e, now) * R }; }
    case "offside": { const { px, py } = ctx.toPixel(e.x, e.y); return { x: px, y: py - R * 2.4 }; }
    default: return null;
  }
}
