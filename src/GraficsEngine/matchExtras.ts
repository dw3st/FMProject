/**
 * "Visual 2" of the live pitch (#129), pure and drawing only: the stretcher after an injury, the
 * managers walking in their technical areas, the benches, the net shaking and the fans jumping on a
 * goal, the scorer's celebration. Px space; times are seconds on the effects clock (real time, frozen
 * while paused). Nothing here touches the `GameState`.
 */
import type { PitchMetrics } from "@/GraficsEngine/pitchMetrics";

/** Phases of the stretcher (real seconds): in from the touchline, by the player, back out. */
export const STRETCHER = { IN_S: 1.4, HOLD_S: 0.9, OUT_S: 1.6 } as const;
export const STRETCHER_TOTAL_S = STRETCHER.IN_S + STRETCHER.HOLD_S + STRETCHER.OUT_S;
/** px beyond the touchline where the stretcher comes from and goes back to. */
const STRETCHER_OUT_PX = 10;

export interface StretcherRun {
  startedAt: number;
  /** Where the player went down (drawn px). */
  target: { x: number; y: number };
  /** Off the nearest touchline (drawn px). */
  entry: { x: number; y: number };
}

/** Starts a stretcher towards a player drawn at `target`, entering from the nearest touchline. */
export function startStretcher(target: { x: number; y: number }, m: Pick<PitchMetrics, "marginY" | "height">, now: number): StretcherRun {
  const top = m.marginY - STRETCHER_OUT_PX;
  const bottom = m.marginY + m.height + STRETCHER_OUT_PX;
  const y = target.y - m.marginY < m.marginY + m.height - target.y ? top : bottom;
  return { startedAt: now, target: { ...target }, entry: { x: target.x, y } };
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Where the stretcher is `now` and whether it carries the player; `done` once it left the pitch. */
export function stretcherPose(run: StretcherRun, now: number): { x: number; y: number; carrying: boolean; done: boolean } {
  const t = now - run.startedAt;
  const { entry: a, target: b } = run;
  if (t <= 0) return { ...a, carrying: false, done: false };
  if (t < STRETCHER.IN_S) {
    const k = smooth(t / STRETCHER.IN_S);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, carrying: false, done: false };
  }
  if (t < STRETCHER.IN_S + STRETCHER.HOLD_S) return { ...b, carrying: false, done: false };
  const out = t - STRETCHER.IN_S - STRETCHER.HOLD_S;
  if (out < STRETCHER.OUT_S) {
    const k = smooth(out / STRETCHER.OUT_S);
    return { x: b.x + (a.x - b.x) * k, y: b.y + (a.y - b.y) * k, carrying: true, done: false };
  }
  return { ...a, carrying: true, done: true };
}

/** Half width (fraction of the drawn pitch length) a manager walks around his spot. */
export const COACH_WALK_FRAC = 0.035;

/**
 * Sideways offset (px) of a manager pacing his technical area: two slow sines, different per
 * manager (`phase`), always within ±halfWidth.
 */
export function coachWalkOffset(t: number, phase: number, halfWidth: number): number {
  return halfWidth * (0.6 * Math.sin(t * 0.55 + phase) + 0.4 * Math.sin(t * 0.23 + 2.1 * phase));
}

/** Bench beside a technical area (drawn px), on the outer side; `seats` substitutes sit on it. */
export interface BenchRect { x: number; y: number; w: number; h: number }

/** Bench length (fraction of the drawn pitch length) and its gap from the walking area. */
const BENCH_FRAC = 0.13;
const BENCH_GAP_FRAC = 0.012;

export function benchRect(
  spot: { x: number; y: number }, side: "left" | "right", m: Pick<PitchMetrics, "width">, markerR: number,
): BenchRect {
  const w = m.width * BENCH_FRAC;
  const h = markerR * 1.4;
  const reach = m.width * (COACH_WALK_FRAC + BENCH_GAP_FRAC) + markerR;
  const x = side === "left" ? spot.x - reach - w : spot.x + reach;
  return { x, y: spot.y - h / 2, w, h };
}

/** Centres of `n` substitutes on a bench, evenly spaced. */
export function benchSeats(b: BenchRect, n: number): { x: number; y: number }[] {
  if (n <= 0) return [];
  const step = b.w / n;
  return Array.from({ length: n }, (_, i) => ({ x: b.x + step * (i + 0.5), y: b.y + b.h / 2 }));
}

/** Net shake after a goal: a damped wobble, 0 at the start and the end of the effect (`p` 0..1). */
export function netShake(p: number): number {
  if (!(p > 0 && p < 1)) return 0;
  return Math.sin(2 * Math.PI * 3 * p) * (1 - p);
}

/** Seconds the scoring side's fans jump. */
export const CROWD_JUMP_S = 1.6;

/** Upward offset (px, ≤ 0) of the scoring side's fans: three hops, smaller each time. */
export function crowdJumpPx(t: number, amplitude: number): number {
  const p = t / CROWD_JUMP_S;
  if (!(p > 0 && p < 1)) return 0;
  return -amplitude * Math.abs(Math.sin(Math.PI * 3 * p)) * (1 - 0.6 * p);
}
