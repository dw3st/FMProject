import type { ShadowSpec } from "@/GraficsEngine/matchLighting";

/**
 * Player shadows drawn as soft shapes (4.29.2): a cast shadow widest at the feet and tapering toward the tip,
 * fading along its length, and a soft contact shadow under the marker. "Soft" = the same shape drawn a few times,
 * each a little larger and fainter (a cheap blur: no filter, drawn once per lighting change). Pure: polygons in
 * marker radii relative to the marker centre (x right, y down), already rotated.
 */
export interface ShadowPolygon {
  points: number[];
  alpha: number;
}

/** Soft passes: scale of the outline and share of the alpha (sums to 1). */
const SOFT: readonly [number, number][] = [[1, 0.45], [1.15, 0.25], [1.32, 0.18], [1.5, 0.12]];
/** Slices along a cast shadow, from the feet to the tip. */
const SLICES = 5;
/** Alpha at the tip, relative to the feet. */
const TIP_FADE = 0.3;
const ELLIPSE_POINTS = 20;

function rotate(points: number[], angle: number, mirror: boolean): number[] {
  const a = angle + (mirror ? Math.PI : 0);
  const cos = Math.cos(a), sin = Math.sin(a);
  const out: number[] = [];
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!, y = points[i + 1]!;
    out.push(x * cos - y * sin, x * sin + y * cos);
  }
  return out;
}

/** Half-width of a cast shadow at distance `t` (0 = feet, 1 = tip) of its length. */
const halfWidthAt = (s: ShadowSpec, t: number, scale: number) => (s.width + (s.tip - s.width) * t) * scale;

function castPolygons(s: ShadowSpec, mirror: boolean): ShadowPolygon[] {
  const out: ShadowPolygon[] = [];
  for (const [scale, share] of SOFT) {
    for (let k = 0; k < SLICES; k++) {
      const t0 = k / SLICES, t1 = (k + 1) / SLICES;
      const x0 = s.length * t0, x1 = s.length * t1;
      const w0 = halfWidthAt(s, t0, scale), w1 = halfWidthAt(s, t1, scale);
      const pts = [x0, -w0, x1, -w1, x1, w1, x0, w0];
      // The last slice ends in a rounded tip.
      if (k === SLICES - 1) {
        const tipPts: number[] = [x0, -w0];
        for (let i = 0; i <= 6; i++) {
          const a = -Math.PI / 2 + (Math.PI * i) / 6;
          tipPts.push(x1 + Math.cos(a) * w1, Math.sin(a) * w1);
        }
        tipPts.push(x0, w0);
        out.push({ points: rotate(tipPts, s.angle, mirror), alpha: s.alpha * share * fadeAt((t0 + t1) / 2) });
        continue;
      }
      out.push({ points: rotate(pts, s.angle, mirror), alpha: s.alpha * share * fadeAt((t0 + t1) / 2) });
    }
  }
  return out;
}

const fadeAt = (t: number) => 1 - (1 - TIP_FADE) * t;

function contactPolygons(s: ShadowSpec, mirror: boolean): ShadowPolygon[] {
  const k = mirror ? -1 : 1;
  const cx = k * Math.cos(s.angle) * s.length, cy = k * Math.sin(s.angle) * s.length;
  return SOFT.map(([scale, share]) => {
    const pts: number[] = [];
    for (let i = 0; i < ELLIPSE_POINTS; i++) {
      const a = (i / ELLIPSE_POINTS) * Math.PI * 2;
      pts.push(cx + Math.cos(a) * s.width * scale, cy + Math.sin(a) * s.tip * scale);
    }
    return { points: pts, alpha: s.alpha * share };
  });
}

/** Every polygon of one shadow (cast: tapered and fading; contact: an ellipse under the feet). */
export function shadowPolygons(s: ShadowSpec, mirror: boolean): ShadowPolygon[] {
  return s.kind === "contact" ? contactPolygons(s, mirror) : castPolygons(s, mirror);
}
