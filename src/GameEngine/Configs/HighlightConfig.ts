/**
 * Highlight layer (stage 18 of the engine rebuild, `.claude/rules/game-engine/highlights.md`): which moments of a match
 * are a "lance" and how long the window around each is. Observation only: nothing here changes the play.
 *
 * Times are **sim seconds** (the physical time of the engine: the sum of `dt` over the live ticks). At 1× that is the
 * real playback time of the 2D pitch, in the 5-minute mode and with `FULL_DURATION` alike.
 */
export const HIGHLIGHT_CONFIG = {
  /** Pre-roll of an open-play lance: from the attacking spell's start, never more than MAX nor less than MIN before the trigger. */
  PRE_MAX_S: 10,
  PRE_MIN_S: 3,
  /** Seconds before the spell's start shown (the recovery that started it). */
  SPELL_LEAD_S: 1,
  /** Pre-roll of a set-piece award (the foul or the clearance that gave it). */
  SET_PIECE_PRE_S: 3,
  /** Pre-roll of a card, an injury, a VAR check. */
  INCIDENT_PRE_S: 4,
  /** After the last trigger the window stays open at least this long… */
  POST_MIN_S: 2,
  /** …and never longer than this (without a new trigger). */
  POST_MAX_S: 9,
  /** After a goal: the celebration shown, then the window closes. */
  POST_GOAL_S: 5,
  /** The other side keeps the ball this long → the lance is over (end = the turnover + TURNOVER_TAIL_S). */
  LOSS_HOLD_S: 2,
  TURNOVER_TAIL_S: 1,
  /** A dead ball (restart freeze) after the last trigger ends the lance this many seconds after it starts. */
  DEAD_TAIL_S: 1,
  /** A new trigger at most this long after a closed lance of the same or lower level reopens it. */
  MERGE_GAP_S: 1.5,
  /** Full level, "attack": the side keeps the ball in the final third this long, or in the box this long. */
  ATTACK_FINAL_THIRD_S: 4,
  ATTACK_BOX_S: 1,
  /** Final third depth (yd from the goal line attacked) and the box (yd deep, yd either side of the centre). */
  FINAL_THIRD_YD: 38,
  BOX_DEPTH_YD: 18,
  BOX_HALF_WIDTH_YD: 22,
  /** A save after a shot of at least this xG is a "big save". */
  BIG_SAVE_XG: 0.15,
} as const;

export type HighlightConfig = typeof HIGHLIGHT_CONFIG;
