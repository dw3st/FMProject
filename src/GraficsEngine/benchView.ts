/**
 * The substitutes' bench (4.38.14-16, tester reports; mock option A): a covered dugout seen from above, below the
 * assistant's lane, the substitutes as small heads and shoulders in the kit, fidgeting, now and then up, and with the
 * arms raised when their team scores. Goalkeepers wear their own colours (two keepers, two colours). Pure; drawn by
 * `PixiPitch` with the extras.
 */
import { mulberry32, seedFrom } from "@/Domain/rng";
import { CROWD_MOTION } from "@/GraficsEngine/crowdMotion";

export const BENCH_VIEW = {
  /** Keeper kit colours, in order; a colour too close to the outfield kit is skipped. */
  KEEPER_KITS: [0xf2c230, 0x3fbf6f, 0xff7a1a, 0xe8559a, 0x8d6bff],
  /** Minimum RGB distance (0..441) between a keeper kit and the outfield kit. */
  KEEPER_MIN_DIST: 120,
  /** Idle: a small bob (fraction of the figure radius), a look toward the ball, now and then one stands up. */
  BOB: 0.06, BOB_HZ: 0.35, LOOK: 0.28, STAND_EVERY_S: 14, STAND_S: 2.2,
  /** Goal: everyone up with the arms raised for GOAL_S, hopping. */
  GOAL_S: 3, GOAL_HZ: 1.4,
  /** Substitutes drawn on the bench (a matchday bench, not the whole squad), keepers first, two rows. */
  MAX_SHOWN: 9, MAX_KEEPERS: 2,
} as const;

/** Indexes of the substitutes drawn on the bench: up to two keepers, then the others in order, at most MAX_SHOWN. */
export function benchShown(roles: readonly string[]): number[] {
  const keepers = roles.flatMap((r, i) => (r === "GK" ? [i] : [])).slice(0, BENCH_VIEW.MAX_KEEPERS);
  const others = roles.flatMap((r, i) => (r === "GK" ? [] : [i]));
  return [...keepers, ...others].slice(0, BENCH_VIEW.MAX_SHOWN).sort((a, b) => a - b);
}

/** Seats of `n` substitutes in two rows inside a bench of width `w` centred on (cx, cy); row 0 is the back row. */
export function benchRows(n: number, cx: number, cy: number, w: number, r: number, toPitch: 1 | -1): { x: number; y: number }[] {
  const back = Math.ceil(n / 2);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const row = i < back ? 0 : 1;
    const inRow = row === 0 ? back : n - back;
    const k = row === 0 ? i : i - back;
    const step = w / Math.max(1, back);
    const x = cx + (k - (inRow - 1) / 2) * step + (row === 1 ? step * 0.25 : 0);
    const y = cy + toPitch * (row === 0 ? -1 : 1) * r * 1.05;
    out.push({ x, y });
  }
  return out;
}

function dist(a: number, b: number): number {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255), dg = ((a >> 8) & 255) - ((b >> 8) & 255), db = (a & 255) - (b & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/** Kit colour of each substitute: the outfield kit, or a keeper colour per keeper (each keeper his own). */
export function benchKits(roles: readonly string[], kit: number): number[] {
  const keeperKits = BENCH_VIEW.KEEPER_KITS.filter((c) => dist(c, kit) >= BENCH_VIEW.KEEPER_MIN_DIST);
  let k = 0;
  return roles.map((r) => (r === "GK" ? keeperKits[k++ % Math.max(1, keeperKits.length)] ?? BENCH_VIEW.KEEPER_KITS[0] : kit));
}

/** Skin and hair of a substitute (indexes of the crowd atlas: hair HAIRS = bald), stable per player. */
export function benchLook(id: string): { skin: number; hair: number; phase: number } {
  const r = mulberry32(seedFrom(`bench:${id}`));
  const skin = Math.floor(r() * CROWD_MOTION.SKINS);
  const hair = r() < 0.12 ? CROWD_MOTION.HAIRS : Math.floor(r() * CROWD_MOTION.HAIRS);
  return { skin, hair, phase: r() * Math.PI * 2 };
}

/** Skin tones and hair colours of the substitutes (index HAIRS of the hair = bald: no entry). */
export const BENCH_SKIN = [0xf1c9a5, 0xe0ac83, 0xc68b5e, 0x9b6a42, 0x6f4527, 0x4a2c17];
export const BENCH_HAIR = [0x1b1410, 0x3a2616, 0x6b4423, 0xa8742f, 0xd8c08a, 0x2b2b2b, 0x777777];

/**
 * One bench seen from above (mock option A): the dugout from `top` to `bottom` px (below the assistant's lane), `w`
 * wide centred on `cx`, the substitutes in one row. `fig` is the unit of a figure (the shoulders' half width), at most
 * `maxUnit`; each seat is the centre of a figure.
 */
export function benchLayout(n: number, cx: number, w: number, top: number, bottom: number, gap: number, maxUnit: number): {
  box: { x: number; y: number; w: number; h: number }; fig: number; seats: { x: number; y: number }[];
} {
  const y = top + gap;
  const h = Math.max(4, bottom - y);
  const step = w / Math.max(1, n);
  const fig = Math.max(1.5, Math.min(maxUnit * 0.4, step * 0.4, h * 0.28));
  const seats = Array.from({ length: n }, (_, i) => ({ x: cx - w / 2 + step * (i + 0.5), y: y + h * 0.5 }));
  return { box: { x: cx - w / 2, y, w, h }, fig, seats };
}

/** Where a photographer stands: behind a goal line (`along` = yards from the centre line, outside the posts) or by the top touchline (`along` = yards from the halfway line). */
export interface PhotographerSpot { side: "left" | "right" | "top"; along: number }

/**
 * Photographers for one match (tester report: a different spread every game): 8 to 13, most behind the goals
 * (never between the posts), a few by the top touchline (never by the benches, below). Stable per seed.
 */
export function photographerSpots(seed: string): PhotographerSpot[] {
  const r = mulberry32(seedFrom(`photographers:${seed}`));
  const n = 8 + Math.floor(r() * 6);
  const out: PhotographerSpot[] = [];
  for (let i = 0; i < n; i++) {
    const k = r();
    if (k < 0.78) {
      const sign = r() < 0.5 ? -1 : 1;
      out.push({ side: r() < 0.5 ? "left" : "right", along: sign * (6 + r() * 26) });
    } else {
      out.push({ side: "top", along: (r() * 2 - 1) * 50 });
    }
  }
  return out;
}

/** Pose of a substitute at `now`: head offset (radii) toward the ball, how far up (0 sitting, 1 standing), arms up. */
export interface BenchPose { lookX: number; lookY: number; up: number; arms: number; bob: number }

/**
 * `ballDx` is the ball's horizontal offset from the seat (px, sign only matters), `toPitch` −1 when the pitch is above
 * the bench, `goalAge` the seconds since his team scored (null: none).
 */
export function benchPose(phase: number, now: number, ballDx: number, toPitch: 1 | -1, goalAge: number | null): BenchPose {
  const V = BENCH_VIEW;
  const bob = Math.sin(now * V.BOB_HZ * Math.PI * 2 + phase) * V.BOB;
  const look = Math.max(-1, Math.min(1, ballDx / 120));
  let lookX = look * V.LOOK, lookY = toPitch * V.LOOK * 0.6;
  // Now and then one gets up for a moment (stretching, shouting at the referee), each on his own clock.
  const cycle = (now + phase * 3) % V.STAND_EVERY_S;
  let up = cycle < V.STAND_S ? Math.sin((cycle / V.STAND_S) * Math.PI) : 0;
  let arms = 0;
  if (goalAge !== null && goalAge >= 0 && goalAge < V.GOAL_S) {
    const g = 1 - goalAge / V.GOAL_S;
    up = Math.max(up, Math.min(1, g * 2));
    arms = Math.min(1, g * 2) * (0.7 + 0.3 * Math.abs(Math.sin(goalAge * V.GOAL_HZ * Math.PI * 2 + phase)));
    lookY = toPitch * V.LOOK;
    lookX = 0;
  }
  return { lookX, lookY, up, arms, bob };
}
