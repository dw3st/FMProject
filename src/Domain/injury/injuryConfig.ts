/**
 * Every tunable of the pure injury model (`docs/superpowers/specs/2026-09-28-injuries-design.md`
 * §1 "Lesões"). Used by the engine, quickSim, training and the daily advance — see `injury.ts`.
 *
 * `BASE` is a PLACEHOLDER calibrated only against the per-minute formula in isolation (see below).
 * Task 2 (`scripts/injury-calibrate.ts`) recalibrates it against the actual engine — tackles,
 * duels, and real match minute counts — to land on ~0.3 injuries/match (both teams combined).
 */
export const INJURY = {
  /**
   * Placeholder base per-minute injury rate. Chosen so a player at every baseline condition
   * (full energy, low load, 25 years old, average strength — all four factors below equal to 1)
   * produces ~0.3 injuries per match summed across 22 players × 90 minutes each:
   *
   *   BASE = 0.3 / (22 × 90)
   *
   * Task 2 recalibrates this against the full engine (contact events, real minute distribution).
   */
  BASE: 0.3 / (22 * 90),

  /** Energy (0..100) → injury-rate multiplier: 1 at full energy (100), up to this at 0 energy. */
  ENERGY_MAX_MULT: 2,

  /** Load (minutes-equivalent, see `Domain/fitness`) at which the load multiplier saturates. */
  LOAD_HIGH: 220,
  /** At LOAD_HIGH, injury-rate multiplier is `1 + this`. Linear between 0 and LOAD_HIGH. */
  LOAD_MAX_BONUS: 0.5,

  /** Age (years) below/at which the age multiplier is 1 (no extra risk). */
  AGE_REF: 30,
  /** Age at which the age multiplier saturates at `AGE_MAX_MULT`. */
  AGE_SATURATION: 40,
  /** Injury-rate multiplier once age reaches `AGE_SATURATION`. Linear between AGE_REF and AGE_SATURATION. */
  AGE_MAX_MULT: 1.3,

  /**
   * Strength attribute (0..10) reference point: at or below this, no reduction (multiplier 1).
   * Chosen as the midpoint of the 0..10 attribute scale — an "average strength" player.
   */
  STRENGTH_REF: 5,
  /** Fraction reduction in injury rate at strength 10 (max), linear from STRENGTH_REF. */
  STRENGTH_MAX_REDUCTION: 0.2,

  /**
   * Flat per-contact-event injury probability (a tackle or a loose-ball duel), scaled by the same
   * energy/load/age/strength factors as `injuryRatePerMinute`. Small placeholder — Task 2
   * calibrates the actual contact-event risk against the engine's tackle/duel volume.
   */
  CONTACT_BASE: 0.004,

  /** Heavy training session → small flat chance of a light injury. Light/normal training: 0. */
  HEAVY_TRAINING_CHANCE: 0.01,

  /** Severity distribution (must sum to 1): 60% light, 30% medium, 10% severe. */
  SEVERITY_WEIGHTS: { light: 0.6, medium: 0.3, severe: 0.1 } as const,

  /** Days out per severity — [min, max] inclusive, uniform. */
  DURATION_DAYS: {
    light: [3, 7],
    medium: [7, 28],
    severe: [30, 120],
  } as const,

  /** Fitness a healed player returns with (spec: "volta com fôlego ~70"). */
  RETURN_FITNESS: 70,
} as const;
