/**
 * Geometry of a stadium from OpenStreetMap shapes (pure). Local frame in metres: x = east, y = north, around a
 * reference point. Azimuths in degrees from north, clockwise.
 */
export interface Pt { x: number; y: number }

const R = 6371000;

/** lat/lon -> local metres around (lat0, lon0) (equirectangular: fine at stadium scale). */
export function toLocal(lat0: number, lon0: number) {
  const k = Math.cos((lat0 * Math.PI) / 180);
  return (lat: number, lon: number): Pt => ({
    x: (((lon - lon0) * Math.PI) / 180) * R * k,
    y: (((lat - lat0) * Math.PI) / 180) * R,
  });
}

export function polygonArea(p: Pt[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i]!, r = p[(i + 1) % p.length]!;
    a += q.x * r.y - r.x * q.y;
  }
  return Math.abs(a) / 2;
}

/** Unit vector of an azimuth (degrees from north, clockwise) in the local frame. */
export const dirOf = (az: number): Pt => ({ x: Math.sin((az * Math.PI) / 180), y: Math.cos((az * Math.PI) / 180) });

export interface PitchRect {
  center: Pt;
  /** Azimuth of the long axis, 0 ≤ axis < 180. */
  axis: number;
  length: number;
  width: number;
}

/** Minimum-area rectangle of a polygon (tries every edge direction). */
export function minAreaRect(points: Pt[]): PitchRect {
  let best: PitchRect | null = null;
  let bestArea = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!, b = points[(i + 1) % points.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const p of points) {
      const u = p.x * ux + p.y * uy, v = -p.x * uy + p.y * ux;
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
    const area = (maxU - minU) * (maxV - minV);
    if (area < bestArea) {
      bestArea = area;
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      const center = { x: cu * ux - cv * uy, y: cu * uy + cv * ux };
      const du = maxU - minU, dv = maxV - minV;
      // Long side direction: u if du ≥ dv, else v (= u rotated +90° counter-clockwise).
      const lx = du >= dv ? ux : -uy, ly = du >= dv ? uy : ux;
      let axis = (Math.atan2(lx, ly) * 180) / Math.PI;
      axis = ((axis % 180) + 180) % 180;
      best = { center, axis, length: Math.max(du, dv), width: Math.min(du, dv) };
    }
  }
  if (!best) throw new Error("degenerate polygon");
  return best;
}

/** Distance along a ray to the nearest crossing of any polygon edge (null: none within `max`). */
export function rayHit(origin: Pt, dir: Pt, polygons: Pt[][], max: number): number | null {
  let best: number | null = null;
  for (const poly of polygons) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
      const ex = b.x - a.x, ey = b.y - a.y;
      const den = dir.x * ey - dir.y * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a.x - origin.x) * ey - (a.y - origin.y) * ex) / den;
      const s = ((a.x - origin.x) * dir.y - (a.y - origin.y) * dir.x) / den;
      if (t > 0 && t <= max && s >= 0 && s <= 1 && (best === null || t < best)) best = t;
    }
  }
  return best;
}

export type StandSide = "top" | "bottom" | "low" | "high";

/**
 * Azimuth looking out from the pitch through each side, in the game's frame: +x (the "high" end) = the pitch axis,
 * +y = axis + 90° (screen y down = clockwise), so the "top" touchline (y 0) faces axis − 90°.
 */
export function sideAzimuth(axis: number, side: StandSide): number {
  const a = side === "high" ? axis : side === "low" ? axis + 180 : side === "top" ? axis - 90 : axis + 90;
  return ((a % 360) + 360) % 360;
}

/**
 * How far the stadium outline is beyond each side of the pitch (metres; median of 5 rays from 20%..80% of the side),
 * null when no outline is hit within `max`.
 */
export function standDepths(pitch: PitchRect, outline: Pt[][], max = 150): Record<StandSide, number | null> {
  const out = {} as Record<StandSide, number | null>;
  const along = dirOf(pitch.axis);
  for (const side of ["top", "bottom", "low", "high"] as const) {
    const n = dirOf(sideAzimuth(pitch.axis, side));
    const isEnd = side === "low" || side === "high";
    const half = (isEnd ? pitch.length : pitch.width) / 2;
    const span = isEnd ? pitch.width : pitch.length;
    const t = isEnd ? { x: -along.y, y: along.x } : along;
    const hits: number[] = [];
    for (let k = 0; k < 5; k++) {
      const f = -0.3 + 0.15 * k;
      const o = { x: pitch.center.x + n.x * half + t.x * f * span, y: pitch.center.y + n.y * half + t.y * f * span };
      const d = rayHit(o, n, outline, max);
      if (d !== null) hits.push(d);
    }
    hits.sort((a, b) => a - b);
    out[side] = hits.length >= 3 ? hits[Math.floor(hits.length / 2)]! : null;
  }
  return out;
}

/** Stand height (m) from its depth beyond the pitch: rake ≈ 0.5, none under 8 m. */
export function heightFromDepth(depth: number | null): number {
  if (depth === null || depth < 8) return 0;
  return Math.round(Math.min(50, 0.5 * depth));
}

/** Height (m) a stadium of this capacity would have on every side: 8 m + 1 m per 2 500 seats, up to 40. */
export const heightFromCapacity = (capacity: number): number => Math.round(Math.min(40, 8 + capacity / 2500));

/**
 * One stand's height: from its depth beyond the pitch, at most `CAP_FACTOR` × the capacity's height (an outline that
 * takes in a plaza or a car park); a side the rays never reach (an incomplete outline) gets the capacity's height.
 */
export const CAP_FACTOR = 1.35;
export function standHeight(depth: number | null, capacity: number): number {
  const byCapacity = heightFromCapacity(capacity);
  if (depth === null) return byCapacity;
  return Math.min(heightFromDepth(depth), Math.round(byCapacity * CAP_FACTOR));
}
