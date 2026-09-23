/**
 * PlayerRatingConfig — tunable weights for the player match rating system.
 *
 * All values represent the delta applied to the player's running rating (0–10 scale).
 * BASELINE is the starting rating for every player at the beginning of a match.
 */
export const RATING_WEIGHTS = {
  BASELINE:         6.0,

  // Offensive
  GOAL:            +1.5,
  ASSIST:          +1.0,
  SHOT:            +0.2,

  // Passing
  PASS_COMPLETED:  +0.02,
  PASS_FAILED:     -0.05,

  // Defensive
  INTERCEPTION:    +0.4,
  TACKLE_WON:      +0.4,
  TACKLE_FAILED:   -0.2,
} as const;
