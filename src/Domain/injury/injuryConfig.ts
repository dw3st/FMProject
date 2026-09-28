/**
 * Every tunable of the pure injury model (`docs/superpowers/specs/2026-09-28-injuries-design.md`
 * §1 "Lesões"). Used by the engine, quickSim, training and the daily advance — see `injury.ts`.
 *
 * `BASE` and `CONTACT_BASE` are calibrated against the full engine by
 * `scripts/injury-calibrate.ts` (Task 2, `docs/superpowers/plans/2026-09-28-injuries.md`) —
 * 300 headless matches (Premier League + `of_championship`), both fresh (fitness 100, load 0),
 * scaling both constants uniformly to land on ~0.3 injuries/match (both teams combined). Measured:
 * 0.280 injuries/match over 300 matches. Rerun the script (`--apply`) after any change to the
 * tackle/duel volume or match-minute distribution that would shift this.
 */
export const INJURY = {
  /**
   * Base per-minute injury rate. Originally derived so a player at every baseline condition (full
   * energy, low load, ≤30yo, average strength — all four factors below equal to 1) alone would
   * produce ~0.3 injuries/match summed across 22 players × 90 minutes (`0.3 / (22 × 90)`); Task 2
   * then recalibrated it against the full engine (see the module doc comment above) — the
   * per-minute component alone accounts for roughly half the target, the rest coming from
   * `CONTACT_BASE` (tackles/duels).
   */
  BASE: 0.00007836990595611286,

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
   * energy/load/age/strength factors as `injuryRatePerMinute`. Calibrated by
   * `scripts/injury-calibrate.ts` against the engine's real tackle/duel volume (see the module
   * doc comment above).
   */
  CONTACT_BASE: 0.0020689655172413794,

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
