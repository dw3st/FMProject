/**
 * Canonical pitch dimensions (yards) — single source of truth for engine and UI.
 */

export const PITCH_LENGTH = 115;
export const PITCH_WIDTH  = 74;

export const GOAL_Y_MIN = 33;
export const GOAL_Y_MAX = 41;

/** Centre line X for engine coordinates (halfway between goal lines). */
export const PITCH_MID_X = PITCH_LENGTH / 2;

/**
 * Goal-score area = penalty area (18-yard box). Used to detect "the ball
 * holder has entered the dangerous zone in front of the goal" — primary trigger
 * for the defensive press_now intent on counter_attack tactic.
 *
 * Depth: 18 yds from each goal line.
 * Width: 44 yds, centred on the pitch — y ∈ [15, 59].
 */
export const PENALTY_AREA_DEPTH    = 18;
export const PENALTY_AREA_Y_MIN    = (PITCH_WIDTH - 44) / 2;       // 15
export const PENALTY_AREA_Y_MAX    = PITCH_WIDTH - PENALTY_AREA_Y_MIN; // 59

/** True when (x, y) is inside the penalty area defended by `ownGoalX` (0 or PITCH_LENGTH). */
export function isInGoalScoreArea(x: number, y: number, ownGoalX: number): boolean {
  if (Math.abs(x - ownGoalX) > PENALTY_AREA_DEPTH) return false;
  if (y < PENALTY_AREA_Y_MIN || y > PENALTY_AREA_Y_MAX) return false;
  return true;
}
