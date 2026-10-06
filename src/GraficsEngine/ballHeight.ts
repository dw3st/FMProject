/** Illustrative height of the ball (yards) for drawing a raised ball and its ground shadow. */
import { clamp } from "@/Domain/math";
import { BALL_HEIGHT } from "@/GraficsEngine/pitchStyle";
import type { GameState } from "@/GameEngine/types";

/** Parabola with `peak` at t = 0.5 and 0 at both ends. */
export function arcHeight(peak: number, t: number): number {
  const c = clamp(t, 0, 1);
  return 4 * peak * c * (1 - c);
}

/** Height of the ball right now: high passes and shots arc, everything else is on the ground. */
export function ballHeight(state: Pick<GameState, "pass" | "shot">): number {
  if (state.shot) return arcHeight(state.shot.header ? BALL_HEIGHT.HEADER : BALL_HEIGHT.SHOT, state.shot.t);
  const p = state.pass;
  if (!p) return 0;
  if (p.kind === "cross") return arcHeight(BALL_HEIGHT.CROSS, p.t);
  if (p.kind === "long_ball") return arcHeight(BALL_HEIGHT.LONG_BALL, p.t);
  if (p.kind === "clearance") return arcHeight(BALL_HEIGHT.CLEARANCE, p.t);
  return 0;
}
