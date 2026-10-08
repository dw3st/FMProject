/**
 * Scouting constants (`.claude/rules/game/scouting.md`, spec
 * `docs/superpowers/specs/2026-10-05-scouting-design.md`). Curves through three points are
 * `[rating 1, rating 5 (neutral), rating 10]` (same shape as the staff curves).
 */
export const SCOUTING = {
  // ── Knowledge ────────────────────────────────────────────────────────────
  /** Implicit knowledge: players of the human club's league / of another league of its country. */
  IMPLICIT_OWN_LEAGUE: 35,
  IMPLICIT_OWN_COUNTRY: 20,
  /** Public fame: top `FAMOUS_COUNT` of the world by overall (the gold stars are a subset). */
  IMPLICIT_FAME: 25,
  FAMOUS_COUNT: 100,
  IMPLICIT_MAX: 60,
  /** Knowledge lost per 30 days without observation, after `DECAY_GRACE_DAYS`. */
  DECAY_PER_30_DAYS: 5,
  DECAY_GRACE_DAYS: 90,
  /** Stored knowledge entries kept at most (the oldest observations go first). */
  MAX_KNOWLEDGE: 6000,

  // ── Uncertainty ──────────────────────────────────────────────────────────
  MAX_NOISE: 2.0,
  NOISE_POWER: 1.2,
  /** Below this knowledge the attributes are hidden ("?") on the screens. */
  HIDDEN_BELOW: 20,
  // The chief scout's multipliers live in `STAFF.SCOUT_UNCERTAINTY_MULT` / `SCOUT_GAIN_MULT`.
  /** Rating of whoever leads a mission → multiplier on the knowledge gained. */
  RATING_GAIN: [0.6, 1.0, 1.4] as const,

  // ── Missions (the field-scout limit is `STAFF.LIMITS.fieldScout`) ─────────────
  REGION_WEEKS: [4, 8, 12] as const,
  CONTINENT_WEEKS: [8, 12] as const,
  YOUTH_WEEKS: [4, 8] as const,
  PLAYER_MAX_WEEKS: 3,
  /** Region mission: players observed per week = BASE + scout rating, at most MAX. */
  OBSERVED_BASE: 6,
  OBSERVED_MAX: 16,
  REGION_GAIN: 30,
  PLAYER_GAIN: 35,
  /** Youth missions observe players up to this age. */
  YOUTH_MAX_AGE: 19,
  /** "Improves the squad" focus: seen overall >= own line average − this. */
  IMPROVES_MARGIN: 0.3,
  /** Every opponent who played against the human club. */
  MATCH_GAIN: 8,
  /** Every shortlisted player, each Monday. */
  SHORTLIST_GAIN: 3,

  // ── Reports ──────────────────────────────────────────────────────────────
  REPORTS_PER_WEEK: 5,
  MAX_REPORTS: 60,
  /** Grade from the relative note (seen overall − own line starter average + 0.5 × seen growth if ≤ 23). */
  GRADE_THRESHOLDS: { A: 0.8, B: 0.3, C: -0.2, D: -0.7 } as const,
  GROWTH_AGE: 23,
  GEM_MAX_AGE: 20,
  GEM_MARGIN: 0.3,
  GEMS_PER_WEEK: 2,
  RECOMMENDATIONS: 3,
  RECOMMEND_MIN_K: 20,
  /** A pick with a report younger than this (days) reuses it; otherwise the chief writes one. */
  RECOMMEND_REPORT_DAYS: 120,

  // ── Shortlist ────────────────────────────────────────────────────────────
  MAX_SHORTLIST: 50,
  CONTRACT_ENDING_DAYS: 183,

  // ── Prospects ────────────────────────────────────────────────────────────
  PROSPECTS_MAX_PER_WEEK: 2,
  PROSPECT_DAYS: 30,
  /** Training compensation by the financial tier of the country's top league (× own wage factor). */
  PROSPECT_FEE: { LOW: 50_000, MEDIUM: 120_000, HIGH: 250_000, ELITE: 400_000 } as const,

  // ── Money ────────────────────────────────────────────────────────────────
  /** Weekly travel per active mission, share of the annual revenue / 52 (player missions: half). */
  TRAVEL_SHARE: { country: 0.0004, continent: 0.0008, world: 0.0015 } as const,
  PLAYER_TRAVEL_MULT: 0.5,
} as const;
