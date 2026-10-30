/**
 * Light of the floodlight towers on the pitch at night (the art preview, 4.41.15): from each tower a soft fan aimed
 * at a point CONE.AIM_X / AIM_Y yards off the centre on its side, and a faint pool around that point. Painted once on
 * a canvas the size of the pitch view; the caller fades it with the floodlight level. Drawing only.
 */
import type { PitchMetrics } from "@/GraficsEngine/pitchMetrics";
import type { TowerSpot } from "@/GraficsEngine/stadiumAtmosphere";

export const FLOOD_CONE = {
  AIM_X: 19.7, AIM_Y: 10.9,
  /** Fan radius = REACH × the distance to the aim point, half-angle HALF_ANGLE rad. */
  REACH: 1.45, HALF_ANGLE: 0.62,
  /** Gradient alphas of the fan (start, at 60%), of the pool, and the pool's radii in yards. */
  FAN: [0.16, 0.07], POOL: 0.07, POOL_RX: 32.8, POOL_RY: 24,
  COLOR: "255,246,214",
  /** Floodlight level where the light starts and where it is full. */
  FROM: 0.35, FULL: 0.75,
} as const;

/** Aim point of a tower: off the pitch centre toward the tower's corner. */
export function coneAim(t: TowerSpot, m: PitchMetrics): { x: number; y: number } {
  const cx = m.marginX + m.width / 2, cy = m.marginY + m.height / 2;
  return {
    x: cx + Math.sign(t.x - cx) * FLOOD_CONE.AIM_X * m.scale,
    y: cy + Math.sign(t.y - cy) * FLOOD_CONE.AIM_Y * m.scale,
  };
}

/** Strength of the light (0..1) for a floodlight level. */
export function coneStrength(flood: number): number {
  return Math.max(0, Math.min(1, (flood - FLOOD_CONE.FROM) / (FLOOD_CONE.FULL - FLOOD_CONE.FROM)));
}

export function paintFloodCones(g: CanvasRenderingContext2D, towers: readonly TowerSpot[], m: PitchMetrics): void {
  const C = FLOOD_CONE;
  for (const t of towers) {
    const a = coneAim(t, m);
    const dist = Math.hypot(a.x - t.x, a.y - t.y);
    const fan = g.createRadialGradient(t.x, t.y, 10, t.x, t.y, dist * 1.2);
    fan.addColorStop(0, `rgba(${C.COLOR},${C.FAN[0]})`);
    fan.addColorStop(0.6, `rgba(${C.COLOR},${C.FAN[1]})`);
    fan.addColorStop(1, `rgba(${C.COLOR},0)`);
    const ang = Math.atan2(a.y - t.y, a.x - t.x);
    g.fillStyle = fan;
    g.beginPath();
    g.moveTo(t.x, t.y);
    g.arc(t.x, t.y, dist * C.REACH, ang - C.HALF_ANGLE, ang + C.HALF_ANGLE);
    g.closePath();
    g.fill();
    const rx = C.POOL_RX * m.scale;
    const pool = g.createRadialGradient(a.x, a.y, 0, a.x, a.y, rx);
    pool.addColorStop(0, `rgba(${C.COLOR},${C.POOL})`);
    pool.addColorStop(1, `rgba(${C.COLOR},0)`);
    g.fillStyle = pool;
    g.beginPath();
    g.ellipse(a.x, a.y, rx, C.POOL_RY * m.scale, 0, 0, Math.PI * 2);
    g.fill();
  }
}
