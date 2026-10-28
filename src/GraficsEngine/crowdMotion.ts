/**
 * Animated crowd (match visual 4.39): the fans of each side are baked in square tiles that move on their own, so the
 * stand sways, a Mexican wave goes round the stadium and the scoring side jumps, without drawing a fan per frame.
 * Pure, in canvas pixels; the effects clock drives it (frozen while paused, nothing with the tab hidden).
 */
import { mulberry32, seedFrom } from "@/Domain/rng";

export const CROWD_MOTION = {
  /** Tile side in seats: a tile moves as one block. */
  TILE_SEATS: 4,
  /** Sway: each tile lifts up to SWAY × the jump height, at SWAY_HZ, with its own phase. */
  SWAY: 0.7, SWAY_HZ: 0.35,
  /** Wave: once every WAVE_EVERY_S it goes round in WAVE_LAP_S; a tile it passes lifts WAVE × the jump height. */
  WAVE: 2.6, WAVE_EVERY_S: 30, WAVE_LAP_S: 9, WAVE_WIDTH: 0.35,
} as const;

/** A seat with a position (px). */
export interface TileSeat { x: number; y: number }

/** A tile of fans: its seats, centre (px) and its own sway phase. */
export interface CrowdTile<S extends TileSeat> { seats: S[]; cx: number; cy: number; phase: number }

/** Groups the seats in square tiles of `tilePx`, in a stable order (row by row). */
export function crowdTiles<S extends TileSeat>(seats: readonly S[], tilePx: number, seed: string): CrowdTile<S>[] {
  const byKey = new Map<string, S[]>();
  for (const s of seats) {
    const key = `${Math.floor(s.y / tilePx)}:${Math.floor(s.x / tilePx)}`;
    const list = byKey.get(key);
    if (list) list.push(s); else byKey.set(key, [s]);
  }
  const rng = mulberry32(seedFrom(`crowd-tiles:${seed}`));
  return [...byKey.entries()]
    .sort(([a], [b]) => {
      const [ar, ac] = a.split(":").map(Number), [br, bc] = b.split(":").map(Number);
      return ar! - br! || ac! - bc!;
    })
    .map(([, list]) => ({
      seats: list,
      cx: list.reduce((n, s) => n + s.x, 0) / list.length,
      cy: list.reduce((n, s) => n + s.y, 0) / list.length,
      phase: rng() * Math.PI * 2,
    }));
}

/**
 * How far (px, upward) a tile is lifted at `now` by the sway and the wave. `centre` is the pitch centre (px), `amp`
 * the jump height (px), `waveFrom` the time of the first wave. Never negative.
 */
export function tileLift(
  tile: { cx: number; cy: number; phase: number }, now: number, centre: { x: number; y: number }, amp: number,
  waveFrom = 0,
): number {
  const C = CROWD_MOTION;
  const sway = Math.max(0, Math.sin(now * C.SWAY_HZ * Math.PI * 2 + tile.phase)) * C.SWAY * amp;
  const sinceWave = now - waveFrom;
  let wave = 0;
  if (sinceWave >= 0) {
    const inCycle = sinceWave % C.WAVE_EVERY_S;
    if (inCycle < C.WAVE_LAP_S) {
      const front = (inCycle / C.WAVE_LAP_S) * Math.PI * 2;
      const ang = Math.atan2(tile.cy - centre.y, tile.cx - centre.x) + Math.PI;
      let d = Math.abs(ang - front);
      d = Math.min(d, Math.PI * 2 - d);
      if (d < C.WAVE_WIDTH) wave = (1 - d / C.WAVE_WIDTH) * C.WAVE * amp;
    }
  }
  return sway + wave;
}
