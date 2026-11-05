/**
 * The ground around the stadium (stadium mock of 2026-11-05), drawn when the stadium has a shape: paving, grass beds and
 * trees outside the footprint, the stadium's contact shadow and its roof rim. Pure, canvas pixels; `PixiPitch` draws it
 * once per mount. A painted backdrop of the real surroundings (art) replaces the paving and trees when there is one.
 */
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { StandGeometry } from "@/GraficsEngine/pitchMetrics";
import { standFootprint } from "@/GraficsEngine/stadiumExtras";

export const SURROUND = {
  PAVING: 0x8d8b85, SLAB: 0x7e7c77, SLAB_YDS: 2.2, SLAB_ALPHA: 0.35,
  BED: 0x4f6f3d, BEDS_PER_1000_YDS2: 0.9,
  /** Trees: per 1000 square yards of free ground, canopy radius in yards. */
  TREES_PER_1000_YDS2: 7, TREE_R_YDS: [1.3, 2.9] as const, KEEP_OFF_YDS: 1.2,
  TREE_TONES: [0x2f4d2a, 0x3d5f31, 0x4a6e36, 0x5b7a3a, 0x6e8a3e, 0x7a5c2c] as const,
  /** Contact shadow of the building, thrown towards SHADOW_DIR (yards). */
  SHADOW_DIR: [-1.4, 0.6] as const, SHADOW_ALPHA: 0.35,
  /** Roof rim along the footprint: width in yards, panel joints every JOINT_YDS. */
  RIM_YDS: 1.1, RIM: 0x8e98a3, RIM_DARK: 0x5d6670, JOINT_YDS: 2.6,
} as const;

/** Point in polygon (even-odd), polygon as [x0, y0, x1, y1, ...]. */
export function insidePoly(poly: readonly number[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i]!, yi = poly[i + 1]!, xj = poly[j]!, yj = poly[j + 1]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inFootprint(polys: readonly (readonly number[])[], x: number, y: number): boolean {
  return polys.some((p) => insidePoly(p, x, y));
}

export interface SurroundTree { x: number; y: number; r: number; tone: number; lobes: { dx: number; dy: number; r: number }[] }
export interface SurroundBed { x: number; y: number; w: number; h: number }

/** Free ground: in the canvas, KEEP_OFF yards away from the footprint. */
function freeAt(polys: number[][], keep: number, x: number, y: number): boolean {
  for (const [dx, dy] of [[0, 0], [keep, 0], [-keep, 0], [0, keep], [0, -keep]] as const) {
    if (inFootprint(polys, x + dx, y + dy)) return false;
  }
  return true;
}

/**
 * Trees and grass beds around the stadium, the same for the same seed: canopies of 3–5 overlapping lobes, scattered as
 * singles and small clusters, never on the footprint.
 */
export function surroundLayout(canvas: { w: number; h: number }, stand: StandGeometry, scale: number, seed: string): {
  trees: SurroundTree[]; beds: SurroundBed[];
} {
  const rng = mulberry32(seedFrom(`surround:${seed}`));
  const polys = standFootprint(stand);
  const keep = SURROUND.KEEP_OFF_YDS * scale;
  const footArea = polys.reduce((s, p) => s + polyArea(p), 0);
  const freeYds2 = Math.max(0, canvas.w * canvas.h - footArea) / (scale * scale);
  const beds: SurroundBed[] = [];
  for (let i = 0, n = Math.round((freeYds2 / 1000) * SURROUND.BEDS_PER_1000_YDS2); i < n * 6 && beds.length < n; i++) {
    const w = (3 + rng() * 6) * scale, h = (2 + rng() * 3) * scale;
    const x = rng() * canvas.w, y = rng() * canvas.h;
    if (freeAt(polys, keep, x, y) && freeAt(polys, keep, x + w, y + h) && freeAt(polys, keep, x + w, y) && freeAt(polys, keep, x, y + h)) {
      beds.push({ x, y, w, h });
    }
  }
  const trees: SurroundTree[] = [];
  const want = Math.round((freeYds2 / 1000) * SURROUND.TREES_PER_1000_YDS2);
  const [r0, r1] = SURROUND.TREE_R_YDS;
  const add = (x: number, y: number, r: number) => {
    if (!freeAt(polys, keep + r * 0.5, x, y)) return;
    if (trees.some((t) => Math.hypot(t.x - x, t.y - y) < (t.r + r) * 0.55)) return;
    const n = 3 + Math.floor(rng() * 3);
    const lobes = Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2 + rng();
      return { dx: Math.cos(a) * r * 0.42, dy: Math.sin(a) * r * 0.42, r: r * (0.55 + rng() * 0.2) };
    });
    trees.push({ x, y, r, tone: Math.floor(rng() * SURROUND.TREE_TONES.length), lobes });
  };
  for (let i = 0; i < want * 20 && trees.length < want; i++) {
    const x = rng() * canvas.w, y = rng() * canvas.h;
    const r = (r0 + rng() * (r1 - r0)) * scale;
    if (rng() < 0.3) {
      // A small cluster of 3–6 around this spot.
      for (let k = 0, m = 3 + Math.floor(rng() * 4); k < m; k++) add(x + (rng() - 0.5) * 5 * scale, y + (rng() - 0.5) * 5 * scale, r * (0.8 + rng() * 0.3));
    } else add(x, y, r);
  }
  trees.sort((a, b) => a.r - b.r);
  return { trees, beds };
}

export function polyArea(p: readonly number[]): number {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j]! * p[i + 1]! - p[i]! * p[j + 1]!;
  return Math.abs(a) / 2;
}
