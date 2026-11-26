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

  /** Stars 0.5..5, 3 neutral; displayed and stored to the half. 0.5★ = every attribute at the floor (the cheap pros). */
  MIN_STARS: 0.5,
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
  /** Youth coach (12.1): multiplier on the growth DP of the academy (training and youth games), in full. */
  YOUTH_COACH_DEV: [0.92, 1, 1.08],
  /** Weights of the 1..20 attributes in an area's score (sum 1). */
  STAR_WEIGHTS: { knowledge: 0.5, playerReading: 0.2, determination: 0.15, discipline: 0.1, adaptability: 0.05 },
  ATTR_MIN: 1,
  ATTR_MAX: 20,
  /** Per-role limit by the club's natural tier. */
  LIMITS: {
    coach: { LOW: 3, MEDIUM: 3, HIGH: 4, ELITE: 5 },
    /** Groundskeepers keep the pitches (`facilities.md`, Etapa 34): more of them at bigger clubs. */
    groundskeeper: { LOW: 1, MEDIUM: 1, HIGH: 2, ELITE: 2 },
    /** The foreman runs the club workshop (`docs/superpowers/specs/2026-11-18-club-craft-design.md`): one. */
    foreman: { LOW: 1, MEDIUM: 1, HIGH: 1, ELITE: 1 },
    fieldScout: 4,
    other: 1,
  },
  /**
   * Share of the staff wage curve per role: the design's 1 / 0.7 / 0.4 / 0.3 / 0.1 scaled by 0.18 so the
   * median starting bill stays under ~4% of the club's revenue in every tier (`scripts/staff-bill.ts`;
   * the old 3-role bill was already ~12% of revenue for a median club, see `staff.md` → "Custo da comissão").
   */
  WAGE_ROLE_SHARE: {
    assistant: 0.18, scout: 0.18, fieldScout: 0.18, fitness: 0.126, goalkeeping: 0.072, coach: 0.072, medic: 0.072,
    analyst: 0.054, groundskeeper: 0.018, youthCoach: 0.072, foreman: 0.036,
  } satisfies Record<StaffRole, number>,
  /** Starting staff: implied stars of the tier +/- this (halves). */
  START_SPREAD_STARS: 0.5,
  CONTRACT: {
    MIN_YEARS: 1, MAX_YEARS: 3, RENEW_WINDOW_DAYS: 60, DIRECTOR_YEARS: 2, DIRECTOR_MAX_AGE: 66,
    DIRECTOR_STAR_MARGIN: 0.5, SEVERANCE_SHARE: 0.5,
  },
  /**
   * Cheap professionals (tester report 2026-11-18: small clubs could not afford any staff). The free pool keeps
   * `PER_ROLE` of them per role (`COACH` area coaches) at 0.5★ or 1★, and anyone of `MAX_STARS` or less asks a wage
   * at a club factor of at most `FACTOR_CAP`: the player factor of a weak squad with good revenue goes up to 4 and
   * made even a 1★ assistant cost 3% of the revenue (`scripts/staff-cheap-measure.ts`).
   */
  /**
   * Ceiling of a professional's wage by the club's revenue (report 2026-11-18: Brusque, Série C, paid 52% of its revenue
   * to the starting staff, priced like 44-rated players). A role's wage is at most annual revenue / 52 × REVENUE_SHARE ×
   * its WAGE_ROLE_SHARE × stars / 3: a full staff at the implied stars costs about 5% of the revenue, one star more costs
   * more. Big clubs never reach it.
   */
  REVENUE_CAP: { SHARE: 0.05, ROLE_SUM: 1.03, MIN_STARS: 0.5, FLOOR: 150 },
  /**
   * Interest of a free professional in the human club (tester report e6707450): the club attracts up to
   * `IMPLIED_STARS[tier]` − `DIVISION_STEP` per division below the first + up to `REP_BONUS` by the manager's
   * reputation (`REP_FROM`..`REP_TO`). Stars over that by at most `OPEN_GAP`: interested; up to `REFUSE_GAP`: asks
   * the market wage (no revenue ceiling) + `PREMIUM_MIN`..`PREMIUM_MAX`; above: will not come.
   */
  INTEREST: {
    DIVISION_STEP: 0.5, REP_FROM: 40, REP_TO: 80, REP_BONUS: 0.5, MIN_ATTRACTION: 0.5,
    OPEN_GAP: 0.5, REFUSE_GAP: 1.5, PREMIUM_MIN: 0.2, PREMIUM_MAX: 0.6,
  },
  CHEAP: { MAX_STARS: 1, PER_ROLE: 3, COACH: 6, FACTOR_CAP: 0.5, HALF_STAR_SCORE: 1.25 },
  /**
   * Asking the board for one more place in a role at its limit (user request, 12.x): approved with the board
   * meter at `MIN_BOARD` or more and a balance of zero or more, up to `MAX_EXTRA` places per role over the tier
   * limit; a refusal blocks that role for `COOLDOWN_DAYS`.
   */
  SLOT_REQUEST: { MIN_BOARD: 60, MAX_EXTRA: 2, COOLDOWN_DAYS: 30 },
  POOL: {
    SIZE: 335,
    BY_ROLE: {
      coach: 90, assistant: 30, fitness: 30, goalkeeping: 30, medic: 25, analyst: 25, scout: 20, fieldScout: 35, groundskeeper: 15, youthCoach: 20, foreman: 15,
    } satisfies Record<StaffRole, number>,
    /** [stars low, stars high, share] - sampled per member. */
    STAR_BANDS: [[1, 2, 0.3], [2.5, 3, 0.4], [3.5, 4, 0.22], [4.5, 5, 0.08]],
    RETIRE_AGE: 68,
    REFRESH_SHARE: 1 / 3,
    /** Scouts of the human club's own country the pool always keeps (tester report c34a5e33): chief, field. */
    LOCAL_SCOUTS: { scout: 3, fieldScout: 6 },
  },
} as const;
