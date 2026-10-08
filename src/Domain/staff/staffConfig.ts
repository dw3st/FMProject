import type { StaffRole } from "@/Domain/staff/staffTypes";

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
  /**
   * Chief scout (`.claude/rules/game/scouting.md`): multiplier on the per-player uncertainty and on
   * the knowledge every scouting mission gains. The uncertainty itself comes from the knowledge.
   */
  SCOUT_UNCERTAINTY_MULT: [1.3, 1.0, 0.75],
  SCOUT_GAIN_MULT: [0.7, 1.0, 1.4],
  /** Overall is shown as a range once the uncertainty reaches this. */
  RANGE_THRESHOLD: 0.5,

  /** Wage: a professional of rating r is paid like a player of overall `BASE + SLOPE * r`, times `SHARE`. */
  WAGE_BASE: 3,
  WAGE_SLOPE: 0.35,
  WAGE_SHARE: 0.5,

  // -- Coaching staff (Etapa 31a, `docs/superpowers/specs/2026-10-08-coaching-staff-design.md`) --

  /** Stars 1..5, 3 neutral; displayed and stored to the half. */
  MIN_STARS: 1,
  NEUTRAL_STARS: 3,
  MAX_STARS: 5,
  /** Stars of a vacant non-area role (= the old vacant rating 3). */
  VACANT_STARS: 2,
  /** AI clubs: the old implied ratings 4/5/6/7 converted (`ratingFromStars` inverse). */
  IMPLIED_STARS: { LOW: 2.5, MEDIUM: 3, HIGH: 3.4, ELITE: 3.8 },
  /** Star curves `[1 star, 3 stars, 5 stars]`. */
  AREA_MULT: [0.7, 1, 1.25],
  /** An area nobody leads still develops, at this pace. */
  AREA_VACANT_MULT: 0.4,
  /** Medic: multiplier on the days out of a new injury. */
  MEDIC_DURATION: [1.2, 1, 0.8],
  /** Analyst: multiplier on the style-familiarity gain. */
  ANALYST_FAMILIARITY: [0.8, 1, 1.25],
  /** Weights of the 1..20 attributes in an area's score (sum 1). */
  STAR_WEIGHTS: { knowledge: 0.5, playerReading: 0.2, determination: 0.15, discipline: 0.1, adaptability: 0.05 },
  ATTR_MIN: 1,
  ATTR_MAX: 20,
  /** Per-role limit by the club's natural tier. */
  LIMITS: { coach: { LOW: 3, MEDIUM: 3, HIGH: 4, ELITE: 5 }, fieldScout: 4, other: 1 },
  /**
   * Share of the staff wage curve per role: the design's 1 / 0.7 / 0.4 / 0.3 / 0.1 scaled by 0.18 so the
   * median starting bill stays under ~4% of the club's revenue in every tier (`scripts/staff-bill.ts`;
   * the old 3-role bill was already ~12% of revenue for a median club, see `staff.md` → "Custo da comissão").
   */
  WAGE_ROLE_SHARE: {
    assistant: 0.18, scout: 0.18, fieldScout: 0.18, fitness: 0.126, goalkeeping: 0.072, coach: 0.072, medic: 0.072,
    analyst: 0.054, groundskeeper: 0.018,
  } satisfies Record<StaffRole, number>,
  /** Starting staff: implied stars of the tier +/- this (halves). */
  START_SPREAD_STARS: 0.5,
  CONTRACT: {
    MIN_YEARS: 1, MAX_YEARS: 3, RENEW_WINDOW_DAYS: 60, DIRECTOR_YEARS: 2, DIRECTOR_MAX_AGE: 66,
    DIRECTOR_STAR_MARGIN: 0.5, SEVERANCE_SHARE: 0.5,
  },
  POOL: {
    SIZE: 300,
    BY_ROLE: {
      coach: 90, assistant: 30, fitness: 30, goalkeeping: 30, medic: 25, analyst: 25, scout: 20, fieldScout: 35, groundskeeper: 15,
    } satisfies Record<StaffRole, number>,
    /** [stars low, stars high, share] - sampled per member. */
    STAR_BANDS: [[1, 2, 0.3], [2.5, 3, 0.4], [3.5, 4, 0.22], [4.5, 5, 0.08]],
    RETIRE_AGE: 68,
    REFRESH_SHARE: 1 / 3,
  },
} as const;
