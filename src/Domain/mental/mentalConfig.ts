/**
 * Mental attributes (`.claude/rules/game/mental.md`): every constant of the derivation and of the
 * mental development pool. Phase 1 of the FM-style decisions: the match engine reads none of them.
 */
export const MENTAL = {
  /** Raw attributes are normalised by this top-of-world value (`n(a) = clamp(a / SCALE, 0, 1)`). */
  SCALE: 6.5,
  /** Experience: 0 at `EXP_FROM` years old, 1 from `EXP_FROM + EXP_SPAN`. */
  EXP_FROM: 18,
  EXP_SPAN: 12,
  /** Weight of the per-player Gaussian draw `g(k)`. */
  NOISE: 0.06,
  WEIGHTS: {
    decisions:    { vision: 0.45, passing: 0.25, pressing: 0.15, exp: 0.15, prof: 0.05 },
    composure:    { finishing: 0.30, dribbling: 0.25, strength: 0.15, passing: 0.10, exp: 0.20, temp: -0.10 },
    flair:        { dribbling: 0.50, vision: 0.25, finishing: 0.15, acceleration: 0.10, amb: 0.08, prof: -0.04 },
    anticipation: { pressing: 0.40, vision: 0.30, tackling: 0.15, exp: 0.15 },
  },
  /** Hidden consistency (0..1): `BASE + PROF·t_prof + TEMP·t_temp + EXP·(exp − 0.5)`. */
  CONSISTENCY: { BASE: 0.5, PROF: 0.25, TEMP: -0.15, EXP: 0.15 },
  /** Development: mental DP = match DP × `DP_SHARE` × `mentalAgeGrowth(age)` × `GROWTH_DP_SCALE`. */
  DEV: {
    DP_SHARE: 0.25,
    /** [upper age (inclusive), growth multiplier]. */
    AGE_GROWTH: [[21, 0.5], [27, 0.7], [31, 0.6], [34, 0.3], [Infinity, 0.1]] as readonly (readonly [number, number])[],
    /** Mental attributes decline only from this age, at `DECLINE_SHARE` × the age decay. */
    DECLINE_FROM: 33,
    DECLINE_SHARE: 0.3,
  },
} as const;

/** UI flag: the mental blocks of the screens stay hidden until the engine reads the attributes. */
export const SHOW_MENTAL = false;
