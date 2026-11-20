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

  // Aerial (`.claude/rules/game-engine/aerial.md`) — a header goal is a GOAL like any other.
  AERIAL_DUEL_WON: +0.05,

  // Discipline (`.claude/rules/game-engine/fouls.md`)
  YELLOW_CARD:       -0.3,
  RED_CARD:          -1.0,
  PENALTY_CONCEDED:  -0.5,
} as const;

/**
 * Stage 17 (`player-scores.md` → "Stage 17", `DECISION_FLAGS.FM_RATINGS`): weights of FM's rating hooks, applied to a
 * per-player tally (`RatingModel.ts`) once per change and clamped at the end. The dense hooks (passes, touches, duels)
 * carry weights sized for the 90-minute match (~18× the events of the compressed one); the rare ones (goals, assists,
 * saves, errors) keep a weight near the legacy one. Shape target: today's distribution by line (FM's own not measured).
 */
export const FM_RATING = {
  /** Below the legacy 6.0: every starter collects a little from the dense hooks over 90 minutes. */
  BASELINE: 5.85,

  GOAL:            +1.4,
  /** Good / great goal adders: the shot's xG below these (no penalty). */
  GOOD_GOAL:       +0.2,
  GREAT_GOAL:      +0.4,
  GOOD_GOAL_XG:    0.15,
  GREAT_GOAL_XG:   0.06,
  /** A goal from this match minute (0-based) that levelled or gave the lead. */
  DECISIVE_GOAL:   +0.3,
  DECISIVE_MINUTE: 79,
  ASSIST:          +0.6,
  SHOT:            +0.02,
  SHOT_ON_TARGET:  +0.06,
  /** Per xG of non-penalty xG over goals, beyond the free margin. */
  XG_SHORTFALL:      -0.35,
  XG_SHORTFALL_FREE: 0.3,

  /** Chance created (a shot from his pass) and its xG in open play (xA). */
  KEY_PASS:        +0.1,
  XA:              +0.5,
  CROSS_COMPLETED: +0.04,
  PASS_COMPLETED:  +0.002,
  PASS_INCOMPLETE: -0.045,
  DRIBBLE_WON:     +0.04,
  DRIBBLE_LOST:    -0.02,

  TACKLE_WON:      +0.25,
  TACKLE_LOST:     -0.08,
  INTERCEPTION:    +0.1,
  BLOCK:           +0.08,
  CLEARANCE:       +0.02,
  POSSESSION_WON:  +0.01,
  AERIAL_WON:      +0.1,
  AERIAL_LOST:     -0.06,

  SAVE:            +0.02,
  GOOD_SAVE:       +0.04,
  GREAT_SAVE:      +0.06,

  MISTAKE_TO_GOAL: -0.6,
  /** Opponent completed passes after which a lost ball is no longer "the mistake" behind a goal. */
  MISTAKE_PASS_WINDOW: 4,
  FOUL:            -0.03,
  PENALTY_CONCEDED: -0.5,
  YELLOW:          -0.3,
  RED:             -1.0,
} as const;
