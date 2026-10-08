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

  // ── Living facilities (Etapa 34) ──────────────────────────────────────────
  /** Items: `docs/superpowers/specs/2026-10-08-living-facilities-design.md`. */
  ITEM_MAX_LEVEL: 10,
  /**
   * life = seasons at level 5; time/matches/training = shares of a typical season's wear; pitch =
   * share of the groundskeeper's effect; valueShare = value at level 6 as a share of annual revenue.
   */
  ITEMS: {
    stadiumPitch:     { group: "stadium",  life: 1,   time: 0.4, matches: 0.6, training: 0,   pitch: 1,   valueShare: 0.006, repairWeeks: 2, rebuildWeeks: 4 },
    seats:            { group: "stadium",  life: 4,   time: 0.6, matches: 0.4, training: 0,   pitch: 0,   valueShare: 0.03,  repairWeeks: 4, rebuildWeeks: 12 },
    stadiumStructure: { group: "stadium",  life: 5,   time: 1,   matches: 0,   training: 0,   pitch: 0,   valueShare: 0.025, repairWeeks: 4, rebuildWeeks: 16 },
    trainingPitches:  { group: "training", life: 1,   time: 0.4, matches: 0,   training: 0.6, pitch: 1,   valueShare: 0.008, repairWeeks: 2, rebuildWeeks: 4 },
    gym:              { group: "training", life: 2,   time: 0.3, matches: 0,   training: 0.7, pitch: 0,   valueShare: 0.008, repairWeeks: 3, rebuildWeeks: 6 },
    pool:             { group: "training", life: 4,   time: 0.6, matches: 0,   training: 0.4, pitch: 0,   valueShare: 0.006, repairWeeks: 3, rebuildWeeks: 8 },
    physio:           { group: "training", life: 3,   time: 0.7, matches: 0,   training: 0.3, pitch: 0,   valueShare: 0.006, repairWeeks: 3, rebuildWeeks: 8 },
    canteen:          { group: "training", life: 5,   time: 1,   matches: 0,   training: 0,   pitch: 0,   valueShare: 0.005, repairWeeks: 3, rebuildWeeks: 8 },
    academyPitches:   { group: "academy",  life: 1.5, time: 1,   matches: 0,   training: 0,   pitch: 0.5, valueShare: 0.006, repairWeeks: 2, rebuildWeeks: 4 },
    academyLodging:   { group: "academy",  life: 4,   time: 1,   matches: 0,   training: 0,   pitch: 0,   valueShare: 0.01,  repairWeeks: 4, rebuildWeeks: 10 },
  },
  WEAR: {
    /** condition = 100 × (1 − wear^POWER). */
    POWER: 2,
    WARN_BELOW: 40,
    CONDEMN_BELOW: 15,
    HOME_GAMES_REF: 25,
    TRAINING_DAYS_REF: 200,
    SESSION: { light: 0.7, normal: 1, heavy: 1.3 },
    /** lifeScale(level) = BASE + STEP × level (level 5 = 1). */
    LIFE_BASE: 0.75,
    LIFE_STEP: 0.05,
    /** Starting wear by kind (deterministic per club and item): condition 100%..80% at worst. */
    START_PITCH: [0.05, 0.25],
    START_OTHER: [0.05, 0.45],
    /** Effects at condition 0 (linear from 40%). */
    PITCH_INJURY_MAX: 1.6,
    TRAINING_PITCH_DEV_MIN: 0.95,
    GYM_DEV_MIN: 0.93,
    CANTEEN_DEV_MIN: 0.97,
    POOL_RECOVERY_MIN: 0.97,
    PHYSIO_RECOVERY_MIN: 0.97,
    /**
     * Physio (human club only): × days out of a new injury. Condition: 1 → DURATION_MAX as it goes
     * 40% → 0%; level: × (1 − LEVEL_STEP × (level − 2 × implied level of the tier)), within
     * [LEVEL_MIN, LEVEL_MAX]. Neutral at the starting level and condition.
     */
    PHYSIO_DURATION_MAX: 1.25,
    PHYSIO_DURATION_LEVEL_STEP: 0.03,
    PHYSIO_DURATION_LEVEL_MIN: 0.85,
    PHYSIO_DURATION_LEVEL_MAX: 1.15,
    /** Normal/light sessions on a bad training pitch: HEAVY_TRAINING_CHANCE × this × penalty. */
    NORMAL_TRAINING_INJURY_SHARE: 0.5,
    SEATS_DEMAND_MIN: 0.9,
    SEATS_PRICE_MIN: 0.95,
    STRUCTURE_DEMAND_MIN: 0.95,
    ACADEMY_QUALITY_MAX_LOSS: 0.15,
    LODGING_PROMISE_MIN: 0.8,
  },
  REPAIR: {
    /** Repair cost = value × Δcondition/100 × this; upgrade = value(level + 1) × this. */
    COST_SHARE: 0.6,
    /** ≤ this share of annual revenue: paid from the balance, no board. */
    SMALL_REPAIR_SHARE: 0.02,
    STEP: 5,
    UPGRADE_WEEKS_SHARE: 0.6,
  },
  /** Groundskeeper wear multiplier on pitches (stars 1/3/5; nobody = NONE; × EXTRA per extra one). */
  GROUNDSKEEPER: { CURVE: [1.3, 1, 0.75] as [number, number, number], NONE: 1.6, EXTRA: 0.9 },
  /** AI home pitch: START − DROP × fraction of the home club's league window. Neutral venue: NEUTRAL. */
  AI_PITCH: {
    START: { LOW: 70, MEDIUM: 80, HIGH: 88, ELITE: 94 },
    DROP: { LOW: 40, MEDIUM: 44, HIGH: 40, ELITE: 30 },
    NEUTRAL: 90,
  },
  /** Signings (`contracts.ts`, `rivals.ts`): appeal below THRESHOLD costs up to DEMAND/PREFERENCE; refusal below REFUSE_BELOW. */
  APPEAL: { THRESHOLD: 50, DEMAND_MAX: 0.1, PREFERENCE_MAX: 0.1, REFUSE_BELOW: 25, YOUTH_MAX_AGE: 21 },

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
