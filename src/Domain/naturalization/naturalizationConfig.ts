/** Naturalization of foreign players (`.claude/rules/game/naturalization.md`). */
export const NATURALIZATION = {
  /** Consecutive seasons at clubs of the country (residence path). */
  RESIDENCE_SEASONS: 5,
  /** Minimum age of the formation path. */
  FORMED_MIN_AGE: 18,
  /** Chance per season (base 0.25 in the design, 0.2 after `scripts/naturalization-measure.ts`: steady state 3.0% → under 3%): base + loyalty + a place in the new national team − a place in the origin one. */
  BASE: 0.2,
  LOYALTY: 0.2,
  NEW_PLACE: 0.3,
  ORIGIN_PLACE: 0.3,
  MIN_CHANCE: 0.05,
  MAX_CHANCE: 0.85,
  /** Days a human manager has to answer; unanswered = supported. */
  ASK_DAYS: 30,
  /** Morale of the player after the manager's answer. */
  SUPPORT_MORALE: 3,
  REFUSE_MORALE: -4,
  /** Length of the process, drawn per player and season. */
  PROCESS_MIN_DAYS: 90,
  PROCESS_MAX_DAYS: 180,
} as const;
