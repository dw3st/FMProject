/** Youth academy constants (`.claude/rules/game/youth.md`). */
export const YOUTH = {
  /** Intake size per club per season: [min, max] inclusive. */
  INTAKE_MIN: 3,
  INTAKE_MAX: 5,
  INTAKE_AGE_MIN: 16,
  INTAKE_AGE_MAX: 17,
  /** Intake level = line average - this (+ tier + assistant bonus, + noise). */
  LEVEL_OFFSET: 1.8,
  LEVEL_SIGMA: 0.5,
  LEVEL_MIN: 1.5,
  LEVEL_MAX: 8,
  /** Rare prospect: chance and level bonus. */
  PROMISE_CHANCE: 0.05,
  PROMISE_BONUS: 1.0,
  TIER_BONUS: { LOW: -0.3, MEDIUM: 0, HIGH: 0.2, ELITE: 0.4 } as const,
  /** Assistant coach rating 1..10 -> level bonus (+/-). */
  ASSISTANT_BONUS: 0.3,
  /** Contract length of an academy player (years). */
  CONTRACT_YEARS: 3,
  /** Largest academy a reborn star can still join. */
  MAX_SIZE: 18,
  /** A youth player not promoted by this age is released at the rollover. */
  RELEASE_AGE: 19,
  /** Training sessions simulated per season for the academy (no matches). */
  SESSIONS_PER_SEASON: 240,
  /** AI clubs promote this many of the intake (the best), within the squad limit. */
  AI_PROMOTE_MAX: 2,
  /** At or above this squad size an AI club promotes only one. */
  AI_PROMOTE_FULL_SQUAD_ONE: 26,
  /** Displayed potential band: fractions of the expected remaining growth. */
  POTENTIAL_BAND: [0.6, 1.2] as const,
  /** Expected yearly level gain by age (used only for the displayed band). */
  GROWTH_BY_AGE: { 16: 0.8, 17: 0.8, 18: 0.7, 19: 0.6, 20: 0.5, 21: 0.4, 22: 0.3, 23: 0.2 } as Record<number, number>,
} as const;
