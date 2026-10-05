/** AI managers: sackings, the free pool and hirings (`.claude/rules/game/managers.md`, Etapa 25). */
export const AI_MANAGERS = {
  sack: {
    /** Monday review only after the league played this share of its rounds. */
    MIN_PROGRESS: 0.3,
    /** (position − target) / league size below this: safe. */
    PRESSURE_MIN: 0.2,
    /** Points per game over the recent form at or above this: safe. */
    FORM_SAFE: 1.3,
    /** ...below this: the weekly chance × FORM_BAD_MULT. */
    FORM_BAD: 0.8,
    FORM_BAD_MULT: 1.5,
    /** No sacking within this many days of the hiring. */
    PROTECT_DAYS: 60,
    /** p(week) = min(MAX_P, BASE_P + SLOPE × (pressure − PRESSURE_MIN)) × patience × form. */
    BASE_P: 0.06,
    SLOPE: 0.8,
    MAX_P: 0.35,
    /** Big clubs sack faster. */
    PATIENCE: { LOW: 0.8, MEDIUM: 1, HIGH: 1.2, ELITE: 1.4 },
    /** Never in the last rounds of the season. */
    LAST_ROUNDS_SAFE: 3,
  },
  rollover: {
    /** Chance of a sacking at the country rollover. */
    RELEGATED: 0.6,
    FAILED: 0.4,
    /** "Failed" = finished at least this share of the league below the target. */
    FAILED_GAP: 0.25,
  },
  vacancy: {
    /** The vacant club hires after 7..21 days. */
    MIN_DAYS: 7,
    MAX_DAYS: 21,
  },
  hire: {
    /** Location weight × this in the candidate score (country 3 / continent 2 / elsewhere 1). */
    LOCATION_WEIGHT: 8,
    /** Score noise amplitude (± half). */
    NOISE: 8,
    /** A manager with reputation above target + this only goes there after a season out. */
    OVERQUALIFIED: 15,
    OVERQUALIFIED_DAYS: 365,
    /** Chance of poaching an employed manager of a club at least POACH_GAP less prestigious. */
    POACH_CHANCE: 0.2,
    POACH_GAP: 0.1,
    /** The interim gets +INTERIM_BONUS when the club earned ≥ INTERIM_PPG points per game under him. */
    INTERIM_BONUS: 10,
    INTERIM_PPG: 1.6,
    /** ...otherwise −INTERIM_PENALTY: a club prefers a proper hire from the pool (keeps the pool small). */
    INTERIM_PENALTY: 30,
  },
  /** A manager free for this many days (two seasons) retires (out of the pool and the ranking tab). */
  RETIRE_AFTER_DAYS: 730,
  /** ...half a season for a manager without ranking points (keeps the free pool under 0,1 × clubs). */
  RETIRE_NO_POINTS_AFTER_DAYS: 180,
} as const;
