/**
 * Physical interception (engine rebuild stage 5, `interception.md` → "Stage 5"). Pure: no state, no draws except the
 * one `rng()` of `resolveTouch`.
 *
 * - `interceptPoint`: the earliest point of the ball's predicted path a defender reaches in time (his reaction, then
 *   his sprint to within his reach), at a height he can play.
 * - `touchChances` / `resolveTouch`: what his touch does to the ball — control, clearance, deflection or the ball
 *   running past him — from his first touch, how far from his body he meets it, the ball's speed and height.
 */
import { INTERCEPT as I } from '@/GameEngine/Configs/InterceptConfig';

export interface PathPoint { x: number; y: number; z: number; t: number }

export interface Interceptor {
  x: number; y: number;
  /** Sprint speed (yd/s). */
  speed: number;
  /** Reach across the ball (yd). */
  reach: number;
  /** Seconds before he moves (0 once he is running to it). */
  reaction: number;
  /** Highest ball he can play (yd). */
  maxZ: number;
}

export interface InterceptPlan { x: number; y: number; z: number; t: number; margin: number }

/**
 * The earliest point of `path` (times from now, ascending) he gets to no later than the ball: reaction + the run to
 * within his reach ≤ the ball's time there, with the ball at a height he can play. Null when he never does (before
 * `cutoff`, the time somebody else takes it).
 */
export function interceptPoint(path: readonly PathPoint[], d: Interceptor, cutoff = Infinity): InterceptPlan | null {
  for (const p of path) {
    if (p.t > cutoff) break;
    if (p.z > d.maxZ) continue;
    const run = Math.max(0, Math.hypot(p.x - d.x, p.y - d.y) - d.reach);
    const tDef = (run > 0 ? d.reaction : 0) + run / Math.max(0.5, d.speed);
    if (tDef <= p.t) return { x: p.x, y: p.y, z: p.z, t: p.t, margin: p.t - tDef };
  }
  return null;
}

export type TouchOutcome = 'control' | 'clear' | 'deflect' | 'miss';

export interface TouchInput {
  /** First touch 0..1. */
  touch: number;
  /** Distance from him to the ball at the touch / his reach (0 at his feet, 1 at the edge). */
  offset: number;
  /** Ball horizontal speed (m/s). */
  speedMs: number;
  /** Ball height (yd). */
  z: number;
  /** Goalkeeper with his hands (inside his box). */
  keeperHands: boolean;
  /** Yards from his own goal line. */
  fromOwnGoal: number;
}

export interface TouchChances { control: number; clear: number; deflect: number; miss: number }

/** Shares of the four outcomes (sum 1). */
export function touchChances(t: TouchInput): TouchChances {
  const offset = Math.max(0, Math.min(1, t.offset));
  const base = t.keeperHands ? I.KEEPER_CONTROL : I.CONTROL_BASE + I.CONTROL_TOUCH * Math.max(0, Math.min(1, t.touch));
  const edge = 1 - I.EDGE_LOSS * offset;
  const speed = Math.max(I.SPEED_FLOOR, Math.min(1, 1 - (t.speedMs - I.SPEED_FREE_MS) / I.SPEED_SPAN_MS));
  const height = !t.keeperHands && t.z > I.KNEE_YD ? I.HIGH_TOUCH : 1;
  const control = Math.max(0, Math.min(1, base * edge * speed * height));
  const rest = 1 - control;
  const miss = rest * I.MISS_EDGE_SHARE * offset;
  const touched = rest - miss;
  const clears = !t.keeperHands && t.fromOwnGoal <= I.CLEAR_ZONE_YD && offset <= I.CLEAR_MAX_OFFSET;
  return clears
    ? { control, clear: touched, deflect: 0, miss }
    : { control, clear: 0, deflect: touched, miss };
}

/** One draw over the shares. */
export function resolveTouch(c: TouchChances, rng: () => number): TouchOutcome {
  const r = rng();
  if (r < c.control) return 'control';
  if (r < c.control + c.clear) return 'clear';
  if (r < c.control + c.clear + c.deflect) return 'deflect';
  return 'miss';
}

/** How far across the ball a defender gets a foot to it (yd): his body + a leg put in by his tackling (0..1). */
export function interceptReachOf(tackling: number): number {
  return I.REACH_BODY_YD + I.REACH_TACKLE_YD * Math.max(0, Math.min(1, tackling));
}
