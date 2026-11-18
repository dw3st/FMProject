/**
 * Defensive cohesion: the back line keeps its partners close and the block reads where the ball is
 * going, not where it is (inspired by Football Manager's defensive manager, which predicts the ball
 * one second ahead and pulls each defender towards his nearest partner). See
 * `.claude/rules/game-engine/defensive-position.md` → "Cohesão da linha e bola prevista".
 *
 * Mutable on purpose: the measurement scripts override it (`COHESION_OVERRIDES`).
 */
export const COHESION = {
  /** Master switch (measurement only: `{"ENABLED":false}` is the engine before this change). */
  ENABLED: true,
  /**
   * Real seconds of ball travel the defensive shape anchor reads ahead (block shift, depth). 0.4:
   * 0.6 alone cut goals 8% (the line dropped too early on every carry); see the rules doc.
   */
  PREDICT_S: 0.4,
  /** Cap on how far ahead of the real ball the predicted point can be (yards). */
  PREDICT_MAX_YDS: 12,
  /**
   * Lateral gap (yards) to the nearest back-line partner above which a defender is pulled in. 14,
   * not FM's ~5 m: the engine's back line sits 9–15 yd apart (median ~11), so 5.5 pulled every pair,
   * split the centre-backs toward their full-backs and opened the hole (+15% goals).
   */
  MAX_GAP: 14,
  /** Share of the excess gap a defender closes (1 = all of it; halved when the two are each other's nearest). */
  STRENGTH: 1,
  /** Cap on the pull added to one target (yards). */
  MAX_PULL: 4,
  /** Two back-liners further apart than this along the pitch are not in the same line (yards). */
  LINE_DEPTH: 10,
} satisfies Record<string, number | boolean>;

/** The roles that form the defensive line. */
export const COHESION_LINE_ROLES: ReadonlySet<string> = new Set(['CB', 'LB', 'RB', 'LWB', 'RWB']);
