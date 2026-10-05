/**
 * Club facilities constants (`.claude/rules/game/facilities.md`,
 * `docs/superpowers/specs/2026-10-04-facilities-design.md`). Level arrays are indexed by level - 1.
 */
export const FACILITIES = {
  MIN_LEVEL: 1,
  MAX_LEVEL: 5,
  NEUTRAL_LEVEL: 3,
  /**
   * AI clubs (and a newly taken-over human club) use this level by financial tier. Centred on the
   * neutral 3 (world mean ~2,8). The academy is always relative to it (see `academyEffectsOf`).
   */
  IMPLIED_LEVEL: { LOW: 2, MEDIUM: 3, HIGH: 3, ELITE: 4 },

  // ── Stadium ───────────────────────────────────────────────────────────────
  /** Share of the capacity in each stand (sides bigger). */
  STAND_SHARE: { north: 0.18, south: 0.18, east: 0.32, west: 0.32 },
  STAND_ORDER: ["north", "east", "south", "west"] as const,
  /** Seats added by one stand project: multiples of SEATS_STEP within [MIN, MAX]. */
  SEATS_MIN: 1000,
  SEATS_MAX: 10000,
  SEATS_STEP: 1000,
  /** Stand works: WEEKS_MIN for SEATS_MIN, WEEKS_MAX for SEATS_MAX, linear. */
  STAND_WEEKS_MIN: 8,
  STAND_WEEKS_MAX: 30,
  /** Cost per seat (EUR): BASE + SPAN × country weight × league tier factor, clamped. */
  SEAT_COST_BASE: 1500,
  SEAT_COST_SPAN: 4500,
  SEAT_COST_MIN: 1500,
  SEAT_COST_MAX: 6000,
  /** League tier → cost factor (tier 4+ uses the last). */
  SEAT_COST_TIER: [1, 0.75, 0.55, 0.4],
  /** Comfort: ticket price × (1 + this × (level - 1)). */
  COMFORT_PRICE_STEP: 0.06,
  /** Comfort works: EUR per seat to reach the level, and weeks. */
  COMFORT_COST_PER_SEAT: [0, 100, 160, 240, 350],
  COMFORT_WEEKS: [0, 8, 12, 16, 20],

  // ── Demand ────────────────────────────────────────────────────────────────
  /** Demand grows with followers^this relative to the anchor. */
  FOLLOWERS_EXPONENT: 0.7,
  /** League tier → demand factor (relative to the anchor tier; tier 4+ uses the last). */
  TIER_DEMAND: [1, 0.6, 0.4, 0.3],
  /**
   * Season phase (fraction of the league window elapsed): opening rounds, middle, run-in. The
   * weighted mean is ~1.00, so the season gate stays where it was.
   */
  PHASE: { OPENING_UNTIL: 0.1, RUN_IN_FROM: 0.8, OPENING: 1.04, MIDDLE: 0.98, RUN_IN: 1.06 },
  /** Attendance rows kept (about two seasons of home games). */
  ATTENDANCE_KEEP: 80,
  /** Completed projects kept. */
  COMPLETED_KEEP: 10,

  // ── Training ground ───────────────────────────────────────────────────────
  TRAINING_RECOVERY: [0.97, 0.985, 1, 1.04, 1.08],
  TRAINING_INJURY: [1.05, 1.025, 1, 0.925, 0.85],
  TRAINING_DEV: [0.95, 0.975, 1, 1.05, 1.1],
  /** Cost to reach the level as a share of annual revenue, and weeks of works. */
  TRAINING_COST_SHARE: [0, 0.03, 0.06, 0.12, 0.2],
  TRAINING_WEEKS: [0, 12, 20, 30, 40],

  // ── Academy ───────────────────────────────────────────────────────────────
  /** Intake level bonus per level away from 3. */
  ACADEMY_QUALITY_STEP: 0.15,
  /** Intake size upper bound (lower bound stays YOUTH.INTAKE_MIN). */
  ACADEMY_INTAKE_MAX: [5, 5, 5, 5, 6],
  /** Chance of a "Wonderkid" prospect. */
  ACADEMY_PROMISE: [0.03, 0.04, 0.05, 0.07, 0.09],
  ACADEMY_COST_SHARE: [0, 0.02, 0.045, 0.09, 0.15],
  ACADEMY_WEEKS: [0, 12, 18, 26, 36],

  // ── Money ─────────────────────────────────────────────────────────────────
  /**
   * Yearly upkeep per level ABOVE the implied level of the club's tier, as a share of annual
   * revenue (the operational cost already covers facilities of the club's class).
   */
  TRAINING_UPKEEP_SHARE: 0.004,
  ACADEMY_UPKEEP_SHARE: 0.003,
  /** Days between monthly instalments. */
  INSTALMENT_DAYS: 30,

  // ── Board decision ────────────────────────────────────────────────────────
  BOARD: {
    /** Below this (or with a negative balance): refused. */
    REFUSE_BELOW: 50,
    /** 50..69: only small projects (≤ SMALL_SHARE of annual revenue). */
    SMALL_SHARE: 0.1,
    APPROVE_FROM: 70,
    /** ≥ FUND_FROM the board pays FUND_MIN..FUND_MAX of the cost (linear up to 100). */
    FUND_FROM: 85,
    FUND_MIN: 0.25,
    FUND_MAX: 0.5,
  },
} as const;
