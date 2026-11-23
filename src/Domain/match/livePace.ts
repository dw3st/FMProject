import type { GameState } from "@/GameEngine/types";
import { getBallPos } from "@/GameEngine/Domain/gameState";

/**
 * Variable pace of mode A (2026-11-23, user report: at 2× the whole match was a blur). The game-seconds per real
 * second follow where the ball is: slow in the attacking third, on a shot and on a dangerous set piece, quick in
 * midfield and on a dead ball far from goal. `modeAPaceFactor` multiplies `MODE_A_SPEED`; its constants are scaled
 * so a whole match still takes ~28 real minutes at 1× (with `LIVE_SPEED_BASE`) (mean of 1 / factor over game time ≈ 1, `scripts/pace-measure.ts`).
 * Drawing pace only: the simulation and its results are the same.
 */
export const MODE_A_PACE = {
  /** Factor deep in the opponent's half (≤ `NEAR` yards from his goal line), on a shot, a penalty or a corner. */
  SLOW: 0.42,
  /** Factor with the ball far from goal (≥ `FAR` yards from it) or a dead ball out there. */
  FAST: 1.9,
  NEAR: 25,
  FAR: 65,
  /** How fast the drawn pace follows the target (per real second): no jumps in speed. */
  EASE: 2.5,
} as const;

export interface PaceView {
  ballX: number;
  /** +1 / −1: the way the side on the ball attacks; 0 when nobody has it. */
  attackDir: 1 | -1 | 0;
  shot: boolean;
  /** A corner, penalty or a direct / crossed free kick waiting to be taken. */
  dangerousSetPiece: boolean;
}

/** Target pace factor for one moment of the match (pure). */
export function modeAPaceFactor(v: PaceView, c: { SLOW: number; FAST: number; NEAR: number; FAR: number } = MODE_A_PACE): number {
  if (v.shot || v.dangerousSetPiece) return c.SLOW;
  if (v.attackDir === 0) return (c.SLOW + c.FAST) / 2;
  const goalX = v.attackDir === 1 ? 115 : 0;
  const dist = Math.abs(goalX - v.ballX);
  const t = Math.min(1, Math.max(0, (dist - c.NEAR) / (c.FAR - c.NEAR)));
  return c.SLOW + (c.FAST - c.SLOW) * t;
}

/** One step of the eased pace toward the target over `dtReal` seconds. */
export function easePace(current: number, target: number, dtReal: number, rate: number = MODE_A_PACE.EASE): number {
  const k = 1 - Math.exp(-rate * Math.max(0, dtReal));
  return current + (target - current) * k;
}

/** The pace view of a live match state: where the ball is, whose it is, a shot or a dangerous set piece. */
export function paceViewOf(s: GameState): PaceView {
  const ball = getBallPos(s);
  const sp = s.setPiece;
  const dangerousSetPiece = !!sp && (sp.type === "corner" || sp.type === "penalty" || (sp.type === "free_kick" && sp.variant !== undefined));
  const ownerId = s.shot ? s.shot.shooterId : s.pass ? s.pass.fromId : sp ? sp.takerId : s.ballHolderId;
  const owner = s.players.find((p) => p.id === ownerId);
  return { ballX: ball.x, attackDir: owner ? owner.attackDir : 0, shot: s.shot != null, dangerousSetPiece };
}
