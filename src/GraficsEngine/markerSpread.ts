/**
 * Drawing-only separation of player markers that overlap on screen.
 *
 * The figures are drawn much wider than a player's real footprint, so two players a yard or two apart cover each
 * other. Each overlapping pair is drawn pushed apart along the line between them, never more than `maxShift` from the
 * real position, and the offset eases in and out so nobody jumps. The engine, the ball and every outcome are untouched.
 */
import type { Pos } from "@/GraficsEngine/renderInterp";

export interface SpreadPoint extends Pos { id: number }

/**
 * Offsets (yards) that separate the points closer than `minDist`. A pair is pushed apart by half the missing distance
 * each (a `fixed` point stays and the other takes it all); a few relaxation passes settle a group; the total offset of
 * a point is capped at `maxShift`. Two points on the same spot split along a direction fixed by their ids.
 */
export function spreadOffsets(
  points: readonly SpreadPoint[],
  minDist: number,
  maxShift: number,
  fixed?: ReadonlySet<number>,
  iterations = 3,
): Map<number, Pos> {
  const out = new Map<number, Pos>();
  if (minDist <= 0 || maxShift <= 0 || points.length < 2) return out;
  const n = points.length;
  const off = points.map(() => ({ x: 0, y: 0 }));
  const min2 = minDist * minDist;
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      const a = points[i]!, oa = off[i]!;
      for (let j = i + 1; j < n; j++) {
        const b = points[j]!, ob = off[j]!;
        const dx = b.x + ob.x - (a.x + oa.x);
        const dy = b.y + ob.y - (a.y + oa.y);
        const d2 = dx * dx + dy * dy;
        if (d2 >= min2) continue;
        const aFixed = fixed?.has(a.id) ?? false, bFixed = fixed?.has(b.id) ?? false;
        if (aFixed && bFixed) continue;
        const d = Math.sqrt(d2);
        let ux: number, uy: number, push: number;
        if (d < 1e-6) {
          const ang = ((a.id * 31 + b.id * 17) % 360) * (Math.PI / 180);
          ux = Math.cos(ang); uy = Math.sin(ang); push = minDist;
        } else {
          ux = dx / d; uy = dy / d; push = minDist - d;
        }
        const wa = aFixed ? 0 : bFixed ? 1 : 0.5;
        oa.x -= ux * push * wa; oa.y -= uy * push * wa;
        ob.x += ux * push * (1 - wa); ob.y += uy * push * (1 - wa);
        moved = true;
      }
    }
    for (const o of off) {
      const len = Math.hypot(o.x, o.y);
      if (len > maxShift) { o.x = (o.x / len) * maxShift; o.y = (o.y / len) * maxShift; }
    }
    if (!moved) break;
  }
  off.forEach((o, i) => { if (o.x !== 0 || o.y !== 0) out.set(points[i]!.id, o); });
  return out;
}

/**
 * Offsets eased from `prev` towards `target` over `dt` seconds at `rate` per second (1 = there at once). An offset that
 * has faded to nothing is dropped.
 */
export function easeOffsets(
  prev: ReadonlyMap<number, Pos>,
  target: ReadonlyMap<number, Pos>,
  dt: number,
  rate: number,
): Map<number, Pos> {
  const k = Math.min(1, Math.max(0, dt * rate));
  const out = new Map<number, Pos>();
  const ids = new Set<number>([...prev.keys(), ...target.keys()]);
  for (const id of ids) {
    const p = prev.get(id), t = target.get(id);
    const x = (p?.x ?? 0) + ((t?.x ?? 0) - (p?.x ?? 0)) * k;
    const y = (p?.y ?? 0) + ((t?.y ?? 0) - (p?.y ?? 0)) * k;
    if (Math.abs(x) > 1e-3 || Math.abs(y) > 1e-3) out.set(id, { x, y });
  }
  return out;
}
