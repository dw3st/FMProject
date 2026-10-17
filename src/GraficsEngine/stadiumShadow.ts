import type { StadiumSun } from "@/Domain/matchday/stadiumSun";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";

/**
 * The stadium's shadow on the pitch (4.30, like FM): a grid of shade values (0 = sunlit, 1 = full shadow), one cell
 * per yard over the pitch and its run-off, in engine yards. Pure; `PixiPitch` turns it into a small texture stretched
 * over the pitch (the linear filtering smooths it further).
 *
 * - Side stand: from the sun's touchline, `depth` yards deep, slanted by the sun's lean, with the roof line in steps
 *   (`sideSteps`) and the corner cuts (`cut`).
 * - End stand (`endShadow`): from the end line the sun leans toward, `endDepth` yards long, roof line in `endSteps`.
 * - Edges fade over `soft` yards (smoothstep); where the two meet, the darker wins (a union, never doubled).
 */
export const SHADE_MARGIN = 3;

export interface ShadeGrid {
  /** Cells across x (length) and y (width). */
  w: number;
  h: number;
  /** Engine yards of the grid's first cell edge (the run-off corner). */
  x0: number;
  y0: number;
  /** Row-major, `y * w + x`, 0..1. */
  cells: Float32Array;
}

const smoothstep = (e0: number, e1: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Multiplier of a roof line at `t` (0..1 along it): segment steps joined by short ramps (`ramp` of a segment). */
function stepAt(steps: number[], t: number, ramp = 0.12): number {
  const n = steps.length;
  const f = Math.max(0, Math.min(n - 1e-9, t * n));
  const i = Math.floor(f);
  const local = f - i;
  const cur = steps[i]!;
  if (local > 1 - ramp / 2 && i + 1 < n) return cur + (steps[i + 1]! - cur) * smoothstep(1 - ramp / 2, 1 + ramp / 2, local);
  if (local < ramp / 2 && i > 0) return steps[i - 1]! + (cur - steps[i - 1]!) * smoothstep(-ramp / 2, ramp / 2, local);
  return cur;
}

/** Depth (yards from the sun's touchline) of the side shadow's edge at `x`. */
export function sideEdgeAt(sun: StadiumSun, depth: number, slant: number, x: number): number {
  const base = depth * (1 + slant * sun.lean * ((2 * x) / PITCH_LENGTH - 1)) * stepAt(sun.sideSteps, x / PITCH_LENGTH);
  const cutLow = sun.cut === "both" || (sun.cut === "lean" && sun.lean < 0);
  const cutHigh = sun.cut === "both" || (sun.cut === "lean" && sun.lean >= 0);
  let k = 1;
  if (cutLow && x < sun.cutX) k = sun.cutDepth + (1 - sun.cutDepth) * Math.max(0, (x + SHADE_MARGIN) / (sun.cutX + SHADE_MARGIN));
  if (cutHigh && x > PITCH_LENGTH - sun.cutX) {
    k = Math.min(k, sun.cutDepth + (1 - sun.cutDepth) * Math.max(0, (PITCH_LENGTH + SHADE_MARGIN - x) / (sun.cutX + SHADE_MARGIN)));
  }
  return base * k;
}

/** The shade grid. `depth` / `endDepth` in yards; `soft` = width of the fading edge in yards. */
export function stadiumShadeGrid(sun: StadiumSun, depth: number, endDepth: number, slant: number, soft: number): ShadeGrid {
  const x0 = -SHADE_MARGIN, y0 = -SHADE_MARGIN;
  const w = PITCH_LENGTH + 2 * SHADE_MARGIN, h = PITCH_WIDTH + 2 * SHADE_MARGIN;
  const cells = new Float32Array(w * h);
  const endHigh = sun.lean >= 0;
  for (let i = 0; i < w; i++) {
    const x = x0 + i + 0.5;
    const edge = sideEdgeAt(sun, depth, slant, x);
    const fromEnd = endHigh ? PITCH_LENGTH - x : x;
    for (let j = 0; j < h; j++) {
      const y = y0 + j + 0.5;
      const d = sun.side === "top" ? y : PITCH_WIDTH - y;
      let s = depth > 0 ? 1 - smoothstep(edge - soft / 2, edge + soft / 2, d) : 0;
      if (sun.endShadow && endDepth > 0) {
        const reach = endDepth * stepAt(sun.endSteps, y / PITCH_WIDTH);
        s = Math.max(s, 1 - smoothstep(reach - soft / 2, reach + soft / 2, fromEnd));
      }
      cells[j * w + i] = s;
    }
  }
  return { w, h, x0, y0, cells };
}
