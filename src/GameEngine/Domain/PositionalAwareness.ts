/**
 * PositionalAwareness — spatial relationship utilities.
 *
 * Pure math functions that compute relative positions between players, the ball,
 * and pass lines. No state, no side effects.
 *
 * These helpers are the foundation for:
 *   • Tackle success modifiers (front / side / behind)
 *   • Interception eligibility (defender between ball and receiver)
 *
 * Used by: ActionOutcomes.ts, gameState.ts
 */

import { PITCH_LENGTH, GOAL_Y_MIN, GOAL_Y_MAX } from '@/GameEngine/Domain/pitch';

// ── Types ─────────────────────────────────────────────────────────────────────

export type RelativePosition = 'front' | 'side' | 'behind';

// Minimal positional interfaces — avoids coupling to full GamePlayer type.
interface Pos   { x: number; y: number }
interface Actor { x: number; y: number; attackDir: 1 | -1 }

// ── Tackle angle modifier ─────────────────────────────────────────────────────

/**
 * Delta to add to a base tackle chance based on the tackler's approach angle
 * relative to the holder's direction of progress.
 *
 * "Forward" for the holder is the direction toward the **opponent's goal**, not
 * the team-wide attackDir constant. This matters when the holder is near a
 * corner or on the goal line — the goal can be to the side (or even behind in
 * pure x-axis terms), but it's still where they want to progress. A tackler
 * approaching from "behind in x" can actually be on the side of the holder's
 * real progression line.
 *
 * A defender positioned in **front** of the attacker has a positional advantage
 * (facing them, in their path) → success bonus.
 * A defender coming from **behind** is a desperate lunge → success penalty.
 *
 * Modifiers:
 *   front  → +0.30
 *   side   → +0.10
 *   behind → −0.30
 */
export function tackleAngleModifier(
  tackler: Pos,
  holder:  Actor,
): number {
  const goalX = holder.attackDir === 1 ? PITCH_LENGTH : 0;
  const goalY = (GOAL_Y_MIN + GOAL_Y_MAX) / 2;

  // Forward = unit vector from holder toward opponent goal centre.
  const fx = goalX - holder.x;
  const fy = goalY - holder.y;
  const fLen = Math.hypot(fx, fy);
  // Holder is on top of the goal (pathological case) — fall back to attackDir axis.
  const forwardX = fLen > 1e-3 ? fx / fLen : holder.attackDir;
  const forwardY = fLen > 1e-3 ? fy / fLen : 0;

  // Tackler vector from holder.
  const tx = tackler.x - holder.x;
  const ty = tackler.y - holder.y;
  const tLen = Math.hypot(tx, ty);
  if (tLen < 0.01) return +0.30; // tackler on top of holder — count as front

  const dot = (tx / tLen) * forwardX + (ty / tLen) * forwardY;

  if (dot >  0.5) return +0.30;  // front
  if (dot < -0.5) return -0.30;  // behind
  return +0.10;                   // side
}

// ── Interception validity ─────────────────────────────────────────────────────

/**
 * Return true when a defender is in a geometrically valid position to intercept
 * a pass in flight.
 *
 * Conditions (all must hold):
 *   1. Projection `t` onto the pass segment is between 0.05 and 0.95 — defender
 *      is ahead of the ball and has not overrun the receiver.
 *   2. Perpendicular distance from defender to the pass line is ≤ INTERCEPTION_CORRIDOR.
 *
 * This prevents unrealistic interceptions where a defender behind the receiver,
 * or wide of the line, steals the ball.
 *
 * @param defender  The player attempting the interception.
 * @param ballPos   Current ball position on the pass line (0 = passer, 1 = receiver).
 * @param receiver  The intended pass target.
 */
/**
 * Returns the perpendicular distance (yards) from the defender to the pass line
 * if the interception geometry is valid, or `null` if out of position.
 *
 * @param corridor  Player's effective interception corridor (yards) — computed by
 *                  `playerInterceptionCorridor()` in ActionOutcomes.ts.
 */
export function getInterceptionPerpDist(
  defender: Pos,
  ballPos:  Pos,
  receiver: Pos,
  corridor: number,
): number | null {
  const vx    = receiver.x - ballPos.x;
  const vy    = receiver.y - ballPos.y;
  const lenSq = vx * vx + vy * vy;
  if (lenSq < 0.01) return null;

  const ox = defender.x - ballPos.x;
  const oy = defender.y - ballPos.y;
  const t  = (ox * vx + oy * vy) / lenSq;

  if (t < 0.05 || t > 0.95) return null;

  const nearX    = ballPos.x + t * vx;
  const nearY    = ballPos.y + t * vy;
  const perpDist = Math.sqrt((defender.x - nearX) ** 2 + (defender.y - nearY) ** 2);

  return perpDist <= corridor ? perpDist : null;
}
