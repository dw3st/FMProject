/**
 * Staff constants (`docs/superpowers/specs/2026-10-01-staff-design.md`). Every effect is a
 * piecewise-linear curve through three points: `[rating 1, rating 5 (neutral), rating 10]`, so a
 * rating-5 professional is always exactly neutral and the extremes are the spec's end values.
 */
export const STAFF = {
  MIN_RATING: 1,
  NEUTRAL_RATING: 5,
  MAX_RATING: 10,
  /** Effect rating of a role left vacant (fired and not replaced). */
  VACANT_RATING: 3,

  /** Assistant: multiplier on development points. */
  ASSISTANT_DEV: [0.9, 1, 1.15],
  /** Fitness coach: multiplier on the daily fitness recovery rate. */
  FITNESS_RECOVERY: [0.95, 1, 1.1],
  /** Fitness coach: multiplier on the injury rate / contact chance (lower is better). */
  FITNESS_INJURY: [1.1, 1, 0.85],
  /** Chief scout: attribute uncertainty (± points of a 0..10 attribute). */
  SCOUT_NOISE: [1.5, 0.6, 0],
  /** Overall is shown as a range once the uncertainty reaches this. */
  RANGE_THRESHOLD: 0.5,

  /** AI clubs do not simulate staff: they use the implicit rating of their financial tier. */
  IMPLIED_RATING: { LOW: 4, MEDIUM: 5, HIGH: 6, ELITE: 7 },

  /** The player's starting staff sits within this many points of the club's implicit rating. */
  START_SPREAD: 1,

  /** Candidates offered per role in the market. */
  MARKET_SIZE: 5,

  /** Wage: a professional of rating r is paid like a player of overall `BASE + SLOPE * r`, times `SHARE`. */
  WAGE_BASE: 3,
  WAGE_SLOPE: 0.35,
  WAGE_SHARE: 0.5,
} as const;
