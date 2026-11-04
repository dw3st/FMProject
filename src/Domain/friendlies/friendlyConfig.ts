/** Friendlies the director arranges (`.claude/rules/game/responsibilities.md` → "Amistosos"). */
export const FRIENDLY = {
  /** Saturday (`Date.getUTCDay`). */
  WEEKDAY: 6,
  /** The next official game has to be at least this far: the last friendly never tires the team for it. */
  MIN_DAYS_BEFORE: 6,
  /** ...and at most this far: friendlies are the pre-season, not the whole break. Up to 6 Saturdays. */
  MAX_DAYS_BEFORE: 42,
  /** DP of a friendly against an official game (growth only). */
  DP_MULT: 0.5,
  /** Below this fitness a player stays out. */
  MIN_FITNESS: 60,
  /** Neutral pitch condition. */
  PITCH: 90,
  XI_SIZE: 11,
} as const;
