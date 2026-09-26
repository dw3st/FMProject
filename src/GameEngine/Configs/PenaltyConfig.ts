/**
 * Penalty shootout tuning. `BASE` is calibrated so two average sides (accuracy 0.5,
 * keeper reflex/diving 0.5) convert ~75% — close to the real-world rate.
 */
export const PENALTY_CONFIG = {
  /** Kicks per side before sudden death. */
  ROUNDS: 5,
  /** Safety cap on sudden-death rounds; after it the winner is a coin flip. */
  MAX_SUDDEN_DEATH_ROUNDS: 30,
  BASE: 0.85,
  /** Shooter multiplier range, mapped linearly from shootAccuracy 0..0.95. */
  SHOOTER_MIN: 0.85,
  SHOOTER_MAX: 1.15,
  /** Keeper multiplier = 1 − avg(reflex, diving) × GK_WEIGHT (0.75..1). */
  GK_WEIGHT: 0.25,
  MIN_CHANCE: 0.55,
  MAX_CHANCE: 0.92,
} as const;
