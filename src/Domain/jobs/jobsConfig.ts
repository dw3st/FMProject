/** Job offers to the human manager (`.claude/rules/game/jobs.md`, Etapa 20). Every tunable number. */
export const JOBS = {
  reputation: {
    /** Shares of the 0..100 reputation. */
    // 8.9.12 (the user: managers who win and rank high should hear more): rank and titles up, board down.
    RANK_WEIGHT: 50,
    BOARD_WEIGHT: 20,
    TITLES_WEIGHT: 20,
    SEASONS_WEIGHT: 10,
    /** Ranking points of titles (last TITLE_SEASONS seasons) that fill the titles term. */
    TITLES_SATURATION: 200,
    TITLE_SEASONS: 3,
    /** Completed seasons that fill the career-length term. */
    SEASONS_SATURATION: 5,
  },

  prestige: {
    /** Added to the world strength percentile by financial tier. */
    TIER_BONUS: { LOW: -0.1, MEDIUM: 0, HIGH: 0.05, ELITE: 0.1 },
  },

  band: {
    /** Employed: [current prestige − BELOW, reputation/100 + ABOVE]. */
    BELOW: 0.05,
    ABOVE: 0.1,
    /** Employed: offers concentrate around current + STEP (one step up), spread SIGMA. */
    STEP: 0.05,
    SIGMA: 0.08,
    /** Unemployed: up to the last club's prestige − UNEMPLOYED_BELOW, concentrated just under it. */
    UNEMPLOYED_BELOW: 0.05,
    UNEMPLOYED_TARGET_BELOW: 0.12,
    UNEMPLOYED_SIGMA: 0.12,
  },

  /** Location weight of an offering club. */
  location: { SAME_COUNTRY: 3, SAME_CONTINENT: 2, OTHER: 1 },

  seasonEnd: {
    /** Expected offers λ = BASE × e^(K × (reputation − PIVOT)): 40 → 0.45, 80 → ~3 (8.9.12: BASE 0.3 → 0.45, MAX 3 → 4). */
    BASE: 0.45,
    PIVOT: 40,
    K: 0.0474,
    MAX: 4,
  },

  /**
   * The monthly window of an employed manager (8.9.12, in place of the one mid-season window): on the 1st of every
   * month of his league's season, λ = BASE × e^(K × (reputation − PIVOT)) × the recent-title bonus, from MIN_REPUTATION.
   * Reputation 60 → 0.18 a month, 72 → 0.38, 76 → 0.48, 85 → 0.82.
   */
  midSeason: {
    MIN_REPUTATION: 50,
    BASE: 0.1,
    PIVOT: 50,
    K: 0.06,
    MAX: 2,
    /** +50% per title in the last TITLE_DAYS, up to ×TITLE_MAX. */
    TITLE_STEP: 0.5,
    TITLE_MAX: 2,
    TITLE_DAYS: 365,
    VALID_DAYS: 10,
  },

  unemployed: {
    MIN: 1,
    MAX: 3,
    /** The first batch arrives FIRST_OFFER_DAYS after the sacking, then one every EVERY_DAYS game days. */
    FIRST_OFFER_DAYS: 7,
    EVERY_DAYS: 14,
    VALID_DAYS: 14,
    /** No offer at all in this many days → one guaranteed offer from the least prestigious club. */
    GUARANTEED_AFTER_DAYS: 120,
  },

  /** A club with a vacant job (AI manager sacked, interim in charge) is this much likelier to offer (Etapa 25). */
  VACANCY_WEIGHT: 3,

  /** Season-end offers without a known first match of the new season stay this long. */
  SEASON_END_FALLBACK_DAYS: 30,
} as const;
