/** Youth competitions constants — `.claude/rules/game/youth-competitions.md`. */
export const YOUTH_COMP = {
  /** Order of the day: under-19 first. */
  AGES: ["u19", "u21"] as const,
  MAX_AGE: { u21: 21, u19: 19 },
  FILLER_AGE: { u21: [17, 21], u19: [16, 19] } as Record<"u21" | "u19", [number, number]>,
  LINES: { GK: 1, DEF: 4, MID: 3, FWD: 3 },
  FILLER_POOL: { GK: 2, DEF: 5, MID: 4, FWD: 3 },
  /** Over-21 reserves in the under-21. */
  OVERAGE_MAX: 5,
  NO_MINUTES_SHARE: 0.4,
  MIN_FITNESS: 60,
  MAX_CALL_UPS: 11,
  WINDOW_MARGIN_DAYS: 7,
  /** Preferred weekdays (getUTCDay), in order. */
  PREFERRED_DAYS: { u21: [2, 3, 1, 4, 5], u19: [4, 3, 5, 2, 1] },
  /** Second slot of a two-rounds week (getUTCDay). */
  TWICE_DAYS: { u21: [2, 5], u19: [1, 4] },
  /** Up to three rounds a week (first leg only). */
  THRICE_DAYS: [1, 3, 5],
  COST: { HUGE: 1000, ADJ: 1 },
  /** Game moved at generation: up to 6 days after the common day. */
  MOVE_MAX_DAYS: 6,
  /** Postponement on the day. */
  MAX_POSTPONE_DAYS: 14,
  /** Growth multiplier of a youth match (measured in Task 12). */
  DP_MULT: 0.6,
  MORALE_YOUTH_WEIGHT: 0.5,
  /** youthMinutes kept. */
  MORALE_WINDOW: 5,
  LEADERS_MIN_APPS: 3,
  PITCH: 90,
} as const;
