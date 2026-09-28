/**
 * Every tunable of the pure fitness/fatigue model (`docs/superpowers/specs/2026-09-27-stamina-design.md`
 * §1 "Modelo de cansaço"). Used by the engine, quickSim and the daily advance — see `fitness.ts`.
 *
 * Two numbers travel with a player across days:
 * - `fitness` ("fôlego"): 0..100, the player's current condition. Drops from playing a match,
 *   recovers on rest/training days.
 * - `load`: minutes-equivalent accumulated fatigue with a half-life decay. High load slows
 *   recovery and raises the in-match energy drain — it is what makes a tight fixture list
 *   (congestion) matter even when `fitness` itself looks recovered.
 */
export const FITNESS = {
  /** Fraction of the missing fitness (100 − fitness) recovered per full rest day, before factors. */
  RECOVERY_BASE: 0.45,

  /** Age → recovery multiplier. Ordered ascending by age threshold; last entry is the catch-all (Infinity). */
  AGE_FACTOR: [
    [24, 1.1],
    [28, 1.0],
    [32, 0.85],
    [Infinity, 0.7],
  ] as [number, number][],

  /** Load half-life in days for `decayLoad`. */
  LOAD_HALF_LIFE_DAYS: 4,

  /** Load (minutes-equivalent) at which the load penalties saturate. ≈ 3 full matches in ~7 days. */
  LOAD_HIGH: 220,

  /** At LOAD_HIGH, recovery rate is multiplied by (1 − this). Linear between 0 and LOAD_HIGH. */
  LOAD_RECOVERY_PENALTY: 0.5,

  /** At LOAD_HIGH, in-match energy cost is multiplied by (1 + this). Linear between 0 and LOAD_HIGH. */
  LOAD_DRAIN_BONUS: 0.25,

  /** Load added by a heavy training session (`addTrainingLoad`). Light/normal sessions add none. */
  HEAVY_TRAINING_LOAD: 10,

  /** Recovery multiplier from the `stamina` attribute (0..10): base + span × stamina/10. */
  STAMINA_RECOVERY: { base: 0.9, span: 0.2 },

  /**
   * `matchStartEnergy` (2026-09-27 "compress the relative gap" balance pass — see `fitness.ts` and
   * `.claude/rules/non-player-games.md` → "Fadiga"): a match's starting energy is `fitness`
   * compressed around `FITNESS_REF` by `START_COMPRESSION`, not `fitness` itself. `FITNESS_REF` is
   * the fitness of a normal, uncongested matchday (see "Fôlego num dia de jogo"), so an average
   * week's match is completely unaffected (`matchStartEnergy(88) === 88` always, regardless of
   * `START_COMPRESSION`) while a squad that is unusually fresh or unusually tired starts the match
   * closer to that normal baseline than its raw fitness would suggest. This softens the impact of a
   * START-fitness gap between two sides without touching the in-match fatigue curve or drain rate
   * at all (both stay exactly as they were), which is what keeps a symmetric match at the reference
   * fitness — the case the engine's own goal-volume calibration is built on — untouched by
   * construction.
   */
  FITNESS_REF: 88,
  /** 1 = no compression (matchStartEnergy = fitness); 0 = every match starts at FITNESS_REF. */
  START_COMPRESSION: 0.4,
} as const;
