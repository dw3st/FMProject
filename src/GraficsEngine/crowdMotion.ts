/**
 * Animated crowd (match visual 4.38.10, livelier in 4.38.11, "Winning Eleven" style): the fans of each side are baked
 * in square tiles that move on their own. Tiles of the same section jump together, like a chant, each section in its
 * own phase; a Mexican wave goes round the stadium; big flags wave over the home stands. The scoring side still jumps
 * (`crowdJumpPx`). Pure, in canvas pixels; the effects clock drives it (frozen while paused, nothing with the tab hidden).
 */
import { mulberry32, seedFrom } from "@/Domain/rng";

export const CROWD_MOTION = {
  /** Tile side in seats: a tile moves as one block. */
  TILE_SEATS: 4,
  /** Section side in tiles: the tiles of a section jump in the same phase (plus JITTER rad). */
  SECTION_TILES: 3, JITTER: 0.7,
  /** Jumping: each tile jumps up to BOUNCE × the jump height, BOUNCE_HZ jumps per second. */
  BOUNCE: 1.1, BOUNCE_HZ: 1.5,
  /** Wave: once every WAVE_EVERY_S it goes round in WAVE_LAP_S; a tile it passes lifts WAVE × the jump height. */
  WAVE: 3.2, WAVE_EVERY_S: 20, WAVE_LAP_S: 8, WAVE_WIDTH: 0.35,
  /** Flags over the home stands: per long side, on the home end, size in seat cells, waving speed. */
  FLAGS: { PER_LONG_SIDE: 4, HOME_END: 2, W: 4, H: 2.6, POLE: 3.2, HZ: 1.1, STRIPS: 8 },
} as const;

/** A seat with a position (px). */
export interface TileSeat { x: number; y: number }

/** A tile of fans: its seats, centre (px) and its jump phase. */
export interface CrowdTile<S extends TileSeat> { seats: S[]; cx: number; cy: number; phase: number }

/** Groups the seats in square tiles of `tilePx`, in a stable order (row by row); one phase per section. */
export function crowdTiles<S extends TileSeat>(seats: readonly S[], tilePx: number, seed: string): CrowdTile<S>[] {
  const C = CROWD_MOTION;
  const byKey = new Map<string, S[]>();
  for (const s of seats) {
    const key = `${Math.floor(s.y / tilePx)}:${Math.floor(s.x / tilePx)}`;
    const list = byKey.get(key);
    if (list) list.push(s); else byKey.set(key, [s]);
  }
  const rng = mulberry32(seedFrom(`crowd-tiles:${seed}`));
  const sectionPx = tilePx * C.SECTION_TILES;
  const sectionPhase = (cx: number, cy: number) =>
    mulberry32(seedFrom(`crowd-section:${seed}:${Math.floor(cx / sectionPx)}:${Math.floor(cy / sectionPx)}`))() * Math.PI * 2;
  return [...byKey.entries()]
    .sort(([a], [b]) => {
      const [ar, ac] = a.split(":").map(Number), [br, bc] = b.split(":").map(Number);
      return ar! - br! || ac! - bc!;
    })
    .map(([, list]) => {
      const cx = list.reduce((n, s) => n + s.x, 0) / list.length;
      const cy = list.reduce((n, s) => n + s.y, 0) / list.length;
      return { seats: list, cx, cy, phase: sectionPhase(cx, cy) + (rng() - 0.5) * C.JITTER };
    });
}

/**
 * How far (px, upward) a tile is lifted at `now` by the jumping and the wave. `centre` is the pitch centre (px), `amp`
 * the jump height (px), `waveFrom` the time of the first wave. Never negative.
 */
export function tileLift(
  tile: { cx: number; cy: number; phase: number }, now: number, centre: { x: number; y: number }, amp: number,
  waveFrom = 0,
): number {
  const C = CROWD_MOTION;
  // A jump is the positive half of a sine: up quickly, a beat on the ground.
  const bounce = Math.max(0, Math.sin(now * C.BOUNCE_HZ * Math.PI * 2 + tile.phase)) ** 1.5 * C.BOUNCE * amp;
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
  return bounce + wave;
}

/** A side of the stand (px). */
export interface StandBand { side: "top" | "bottom" | "left" | "right"; x: number; y: number; w: number; h: number }

/** A flag over the stand: its base (px) and its waving phase. */
export interface StandFlag { x: number; y: number; phase: number }

/**
 * Flags over the home stands: evenly along the two long sides and on the home end (never the away end, never a stand
 * under works).
 */
export function standFlags(
  bands: readonly StandBand[], homeSide: "left" | "right", seed: string, skip: readonly string[] = [],
): StandFlag[] {
  const F = CROWD_MOTION.FLAGS;
  const rng = mulberry32(seedFrom(`stand-flags:${seed}`));
  const out: StandFlag[] = [];
  for (const b of bands) {
    if (skip.includes(b.side)) continue;
    if (b.side === "top" || b.side === "bottom") {
      for (let i = 0; i < F.PER_LONG_SIDE; i++) {
        const x = b.x + b.w * (i + 0.5) / F.PER_LONG_SIDE;
        const y = b.side === "top" ? b.y + b.h * 0.6 : b.y + b.h * 0.4;
        out.push({ x, y, phase: rng() * Math.PI * 2 });
      }
    } else if (b.side === homeSide) {
      for (let i = 0; i < F.HOME_END; i++) {
        const y = b.y + b.h * (i + 0.5) / F.HOME_END;
        const x = b.side === "left" ? b.x + b.w * 0.6 : b.x + b.w * 0.4;
        out.push({ x, y, phase: rng() * Math.PI * 2 });
      }
    }
  }
  return out;
}

/** Vertical offset (px) of strip `k` of a waving flag at `now`: a wave running from the pole to the free end. */
export function flagWave(flag: StandFlag, k: number, now: number, amp: number): number {
  const F = CROWD_MOTION.FLAGS;
  return Math.sin(now * F.HZ * Math.PI * 2 + flag.phase - k * 0.7) * amp * (k / F.STRIPS);
}
