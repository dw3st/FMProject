/** Illustrative height of the ball (yards) for drawing a raised ball and its ground shadow. */
import { clamp } from "@/Domain/math";
import { BALL_HEIGHT } from "@/GraficsEngine/pitchStyle";
import type { GameState } from "@/GameEngine/types";

/** Parabola with `peak` at t = 0.5 and 0 at both ends. */
export function arcHeight(peak: number, t: number): number {
  const c = clamp(t, 0, 1);
  return 4 * peak * c * (1 - c);
}

/**
 * Lofted ground pass (drawing only): a long pass to feet or into space leaves the ground a little, chest height at most;
 * a short one rolls. Grows from LOFT_FROM yards to LOFT_FULL.
 */
export const LOFT = { FROM: 26, FULL: 45, REGULAR: 1.1, THROUGH: 0.7 } as const;

function loftPeak(kind: "regular" | "through", distance: number): number {
  if (!(distance > LOFT.FROM)) return 0;
  const k = clamp((distance - LOFT.FROM) / (LOFT.FULL - LOFT.FROM), 0, 1);
  return (kind === "regular" ? LOFT.REGULAR : LOFT.THROUGH) * (0.35 + 0.65 * k);
}

/** Height of the ball with the flight progress `t` given (an interpolated one between two sim steps). */
function heightAt(state: Pick<GameState, "pass" | "shot">, t: number): number {
  if (state.shot) return arcHeight(state.shot.header ? BALL_HEIGHT.HEADER : BALL_HEIGHT.SHOT, t);
  const p = state.pass;
  if (!p) return 0;
  if (p.kind === "cross") return arcHeight(BALL_HEIGHT.CROSS, t);
  if (p.kind === "long_ball") return arcHeight(BALL_HEIGHT.LONG_BALL, t);
  if (p.kind === "clearance") return arcHeight(BALL_HEIGHT.CLEARANCE, t);
  if (p.kind === "regular" || p.kind === "through") return arcHeight(loftPeak(p.kind, p.distance), t);
  return 0;
}

/** Height of the ball right now: high passes and shots arc, long passes lift a little, the rest rolls. */
export function ballHeight(state: Pick<GameState, "pass" | "shot">): number {
  return heightAt(state, state.shot ? state.shot.t : state.pass ? state.pass.t : 0);
}

/**
 * Height between two sim steps: on the same flight the progress is blended and the arc read there (a true parabola
 * at 60 fps, not straight pieces between 0.2 s samples); otherwise a plain blend of the two heights.
 */
export function ballHeightBetween(prev: Pick<GameState, "pass" | "shot">, cur: Pick<GameState, "pass" | "shot">, alpha: number): number {
  const a = clamp(alpha, 0, 1);
  if (prev.shot && cur.shot && prev.shot.shooterId === cur.shot.shooterId && prev.shot.toY === cur.shot.toY) {
    return heightAt(cur, prev.shot.t + (cur.shot.t - prev.shot.t) * a);
  }
  if (!prev.shot && !cur.shot && prev.pass && cur.pass && prev.pass.fromId === cur.pass.fromId
    && prev.pass.toX === cur.pass.toX && prev.pass.toY === cur.pass.toY && prev.pass.kind === cur.pass.kind) {
    return heightAt(cur, prev.pass.t + (cur.pass.t - prev.pass.t) * a);
  }
  const hp = ballHeight(prev), hc = ballHeight(cur);
  return hp + (hc - hp) * a;
}

/** A high ball that drops loose bounces: decaying hops over the first second (real seconds `t` since it landed). */
export const BOUNCE = { FIRST: 1.3, DECAY: 2.6, PERIOD: 0.42, SECONDS: 1.4 } as const;

export function bounceHeight(t: number): number {
  if (!(t > 0) || t >= BOUNCE.SECONDS) return 0;
  return BOUNCE.FIRST * Math.exp(-BOUNCE.DECAY * t) * Math.abs(Math.sin((Math.PI * t) / BOUNCE.PERIOD));
}
