/** Contract constants (`docs/superpowers/specs/2026-09-30-contracts-design.md`). */
export const CONTRACT_CONFIG = {
  /** Initial contract length (years) by age: [min, max] inclusive. */
  INITIAL_YEARS: { young: [3, 5], prime: [2, 4], veteran: [1, 2] } as const,
  YOUNG_MAX_AGE: 23,
  PRIME_MAX_AGE: 29,
  /** Accepted offer length. */
  MIN_YEARS: 1,
  MAX_YEARS: 5,
  /** A contract may not run past this age. */
  MAX_CONTRACT_AGE: 36,
  /** Demand multiplier: 1 + clamp(rating - teamAvg, 0, IMPORTANCE_CAP) * IMPORTANCE_WEIGHT. */
  IMPORTANCE_CAP: 1.5,
  IMPORTANCE_WEIGHT: 0.3,
  /** x1.15 for a player <= YOUNG_MAX_AGE rated at or above the team average. */
  YOUNG_RISING_BONUS: 1.15,
  /** AI renews if rating >= teamAvg - this, and age < AI_RENEW_MAX_AGE. */
  AI_RENEW_RATING_MARGIN: 0.3,
  AI_RENEW_MAX_AGE: 33,
  /** AI renewal length by age (years). */
  AI_RENEW_YEARS: { young: 3, prime: 2, veteran: 1 },
  /** Rollover treats a contract ending within this many days as expiring (calendar drift). */
  ROLLOVER_GRACE_DAYS: 60,
  /** A club that would drop below this many players keeps its best expiring ones. */
  MIN_SQUAD_AFTER_EXPIRY: 18,
  /** Inbox warning: days before the league's season end. */
  WARNING_DAYS_BEFORE: 90,
  /** AI clubs refill to this many players after the rollover expiries. */
  MIN_SQUAD_AI: 24,
  /** Refill keeps the wage bill this far (share of the cap) below the "tight" threshold. */
  REFILL_HEADROOM: 0.03,
  /** Contract length (years) of a filler youngster. */
  YOUTH_CONTRACT_YEARS: 3,
  /** AI clubs that try the free pool each day. */
  FREE_AGENT_CLUBS_PER_DAY: 10,
} as const;
