import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import { PITCH_COLOR } from "@/GraficsEngine/playerFaces";
import { PITCH_STRIPES, PITCH_WEAR } from "@/GraficsEngine/pitchStyle";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { MowingPattern, TurfType } from "@/types/facilityTypes";

/**
 * The match pitch surface (spec 2026-10-16-pitch-types §3): mowing pattern and wear by the condition of the
 * day, as shapes in engine yards (x 0..115 from the left goal line, y 0..74 from the top touchline). Pure:
 * `PixiPitch` and the SVG previews draw the same shapes. Rings are clipped to the pitch by the renderer.
 */

export type PitchVisualBand = "pristine" | "faded" | "worn" | "rotten";
export type SurfaceShape =
  | { kind: "rect"; layer: "mowing" | "wear"; x: number; y: number; w: number; h: number; color: number; alpha: number }
  | { kind: "poly"; layer: "mowing" | "wear"; points: number[]; color: number; alpha: number }
  | { kind: "ring"; layer: "mowing"; cx: number; cy: number; r: number; width: number; color: number; alpha: number };

export interface PitchSurface {
  /** Fill of the pitch rectangle. */
  base: number;
  shapes: SurfaceShape[];
  /** Alpha of the white lines. */
  lineAlpha: number;
  /** Rotten pitch: straight lines drawn dashed (failing). */
  dashedLines: boolean;
}

export interface PitchSurfaceInput {
  condition: number;
  turf: TurfType;
  mowing: MowingPattern;
  /** Same seed, same patches (the fixture id). */
  seed: string;
}

const L = PITCH_LENGTH;
const W = PITCH_WIDTH;
const CY = W / 2;

export function pitchVisualBand(condition: number): PitchVisualBand {
  if (condition >= 70) return "pristine";
  if (condition >= 40) return "faded";
  if (condition >= 15) return "worn";
  return "rotten";
}

/** Sutherland–Hodgman clip of a polygon (x,y pairs) to the pitch rectangle. */
export function clipToPitch(points: number[]): number[] {
  type P = [number, number];
  let poly: P[] = [];
  for (let i = 0; i < points.length; i += 2) poly.push([points[i]!, points[i + 1]!]);
  const edges: { inside: (p: P) => boolean; cut: (a: P, b: P) => P }[] = [
    { inside: (p) => p[0] >= 0, cut: (a, b) => [0, a[1] + (b[1] - a[1]) * (0 - a[0]) / (b[0] - a[0])] },
    { inside: (p) => p[0] <= L, cut: (a, b) => [L, a[1] + (b[1] - a[1]) * (L - a[0]) / (b[0] - a[0])] },
    { inside: (p) => p[1] >= 0, cut: (a, b) => [a[0] + (b[0] - a[0]) * (0 - a[1]) / (b[1] - a[1]), 0] },
    { inside: (p) => p[1] <= W, cut: (a, b) => [a[0] + (b[0] - a[0]) * (W - a[1]) / (b[1] - a[1]), W] },
  ];
  for (const e of edges) {
    const out: P[] = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i]!;
      const prev = poly[(i + poly.length - 1) % poly.length]!;
      if (e.inside(cur)) {
        if (!e.inside(prev)) out.push(e.cut(prev, cur));
        out.push(cur);
      } else if (e.inside(prev)) {
        out.push(e.cut(prev, cur));
      }
    }
    poly = out;
    if (poly.length === 0) break;
  }
  return poly.flatMap((p) => [p[0], p[1]]);
}

/** Irregular patch elongated along x (goal to goal): a smoothly jittered ellipse, clipped to the pitch. */
function blob(rng: () => number, cx: number, cy: number, rx: number, ry: number): number[] {
  const n = 22;
  const phases = [rng() * Math.PI * 2, rng() * Math.PI * 2, rng() * Math.PI * 2];
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const k = 1 + 0.16 * Math.sin(2 * a + phases[0]!) + 0.1 * Math.sin(3 * a + phases[1]!) + 0.07 * Math.sin(5 * a + phases[2]!);
    pts.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
  }
  return clipToPitch(pts);
}

function mowingShapes(mowing: MowingPattern, color: number, alpha: number): SurfaceShape[] {
  const out: SurfaceShape[] = [];
  if (mowing === "stripes") {
    const w = L / PITCH_STRIPES.COUNT;
    for (let i = 1; i < PITCH_STRIPES.COUNT; i += 2) out.push({ kind: "rect", layer: "mowing", x: i * w, y: 0, w, h: W, color, alpha });
  } else if (mowing === "checker") {
    const cols = PITCH_STRIPES.COUNT;
    const rows = 10;
    const w = L / cols;
    const h = W / rows;
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) {
      if ((c + r) % 2 === 1) out.push({ kind: "rect", layer: "mowing", x: c * w, y: r * h, w, h, color, alpha });
    }
  } else if (mowing === "diagonal") {
    const band = 7;
    const slope = Math.tan((35 * Math.PI) / 180);
    const shift = W / slope;
    for (let x0 = -shift; x0 < L; x0 += band * 2) {
      const pts = clipToPitch([x0, W, x0 + band, W, x0 + band + shift, 0, x0 + shift, 0]);
      if (pts.length >= 6) out.push({ kind: "poly", layer: "mowing", points: pts, color, alpha });
    }
  } else {
    for (let r = 9; r < 80; r += 14) out.push({ kind: "ring", layer: "mowing", cx: L / 2, cy: CY, r, width: 7, color, alpha });
  }
  return out;
}

export function pitchSurface(input: PitchSurfaceInput): PitchSurface {
  const band = pitchVisualBand(input.condition);
  const synthetic = input.turf === "synthetic";
  if (synthetic) {
    const alpha = band === "pristine" ? 1 : Math.max(0.35, (input.condition - 0) / 70);
    return { base: PITCH_WEAR.SYNTH_BASE, shapes: mowingShapes(input.mowing, PITCH_WEAR.SYNTH_LIGHT, alpha), lineAlpha: 0.9, dashedLines: false };
  }
  if (band === "pristine") {
    return { base: PITCH_COLOR, shapes: mowingShapes(input.mowing, PITCH_STRIPES.LIGHT, 1), lineAlpha: 0.9, dashedLines: false };
  }
  const rng = mulberry32(seedFrom(`pitch:${input.seed}`));
  const shapes: SurfaceShape[] = [];
  const poly = (points: number[], color: number, alpha: number) => {
    if (points.length >= 6) shapes.push({ kind: "poly", layer: "wear", points, color, alpha });
  };
  if (band === "faded") {
    const t = (input.condition - 40) / 30; // 1 at 70, 0 at 40
    shapes.push(...mowingShapes(input.mowing, PITCH_WEAR.LIGHT_FADED, 0.7 * t));
    const a = 0.45 * (1 - t) + 0.1;
    poly(blob(rng, 6, CY, 9, 11), PITCH_WEAR.YELLOW, a);
    poly(blob(rng, L - 6, CY, 9, 11), PITCH_WEAR.YELLOW, a);
    poly(blob(rng, L / 2, CY, 11, 8), PITCH_WEAR.YELLOW, a);
    return { base: PITCH_WEAR.BASE_FADED, shapes, lineAlpha: 0.85, dashedLines: false };
  }
  if (band === "worn") {
    const k = 0.85 + 0.15 * ((40 - input.condition) / 25); // 0.85 at 40 → 1 at 15
    poly(blob(rng, L / 2, CY, 42 * k, 6 * k), PITCH_WEAR.YELLOW, 0.4);
    poly(blob(rng, 5, CY, 10 * k, 13 * k), PITCH_WEAR.DIRT, 0.85);
    poly(blob(rng, L - 5, CY, 10 * k, 13 * k), PITCH_WEAR.DIRT, 0.85);
    poly(blob(rng, L / 2, CY, 13 * k, 9 * k), PITCH_WEAR.DIRT, 0.75);
    for (let i = 0; i < 4; i++) poly(blob(rng, 15 + rng() * (L - 30), 6 + rng() * (W - 12), 3, 2), PITCH_WEAR.DIRT_DARK, 0.7);
    return { base: PITCH_WEAR.BASE_WORN, shapes, lineAlpha: 0.65, dashedLines: false };
  }
  poly(blob(rng, L / 2, CY, 50, 11), PITCH_WEAR.DIRT, 0.7);
  poly(blob(rng, 5, CY, 15, 20), PITCH_WEAR.MUD, 1);
  poly(blob(rng, L - 5, CY, 15, 20), PITCH_WEAR.MUD, 1);
  poly(blob(rng, L / 2, CY, 16, 12), PITCH_WEAR.MUD, 0.9);
  for (let i = 0; i < 6; i++) poly(blob(rng, 12 + rng() * (L - 24), 5 + rng() * (W - 10), 4, 2.5), PITCH_WEAR.MUD_DARK, 1);
  for (let i = 0; i < 2; i++) poly(blob(rng, 10 + rng() * (L - 20), 8 + rng() * (W - 16), 4, 1.6), PITCH_WEAR.PUDDLE, 0.55);
  return { base: PITCH_WEAR.BASE_ROTTEN, shapes, lineAlpha: 0.45, dashedLines: true };
}
