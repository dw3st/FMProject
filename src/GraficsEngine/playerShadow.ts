import type { ShadowSpec } from "@/GraficsEngine/matchLighting";

/**
 * Player shadows drawn as soft shapes: since 4.31.3 a round oval under the player, nudged away from the light
 * (sun or floodlights), and a soft contact shadow under the marker. "Soft" = the same shape drawn a few times,
 * each a little larger and fainter (a cheap blur: no filter, drawn once per lighting change). Pure: polygons in
 * marker radii relative to the marker centre (x right, y down), already rotated.
 */
export interface ShadowPolygon {
  points: number[];
  alpha: number;
}

/** Soft passes: scale of the outline and share of the alpha (sums to 1). */
const SOFT: readonly [number, number][] = [[1, 0.45], [1.15, 0.25], [1.32, 0.18], [1.5, 0.12]];
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

/**
 * A sun / floodlight shadow (4.31.3): a soft oval right under the player, its centre `length` from the marker centre
 * toward the shadow's direction, `width` along that direction and `tip` across it.
 */
function castPolygons(s: ShadowSpec, mirror: boolean): ShadowPolygon[] {
  return SOFT.map(([scale, share]) => {
    const pts: number[] = [];
    for (let i = 0; i < ELLIPSE_POINTS; i++) {
      const a = (i / ELLIPSE_POINTS) * Math.PI * 2;
      pts.push(s.length + Math.cos(a) * s.width * scale, Math.sin(a) * s.tip * scale);
    }
    return { points: rotate(pts, s.angle, mirror), alpha: s.alpha * share };
  });
}

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

/** Every polygon of one shadow (cast: an oval turned toward the shadow's direction; contact: an ellipse under the feet). */
export function shadowPolygons(s: ShadowSpec, mirror: boolean): ShadowPolygon[] {
  return s.kind === "contact" ? contactPolygons(s, mirror) : castPolygons(s, mirror);
}
