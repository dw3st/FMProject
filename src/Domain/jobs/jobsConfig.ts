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

  /** Job security of every manager and the human's applications (8.9.29). */
  application: {
    /** Risk = (position − target) / size + (FORM_REF − form ppg) × FORM_WEIGHT, × min(1, progress / FULL_PROGRESS). */
    FORM_REF: 1.4,
    FORM_WEIGHT: 0.08,
    FULL_PROGRESS: 0.3,
    /** Just hired: the risk counts half. */
    NEW_DAYS: 60,
    /** Level thresholds of the risk: very secure ≤ −0.2, secure ≤ −0.05, stable < 0.1, threatened < 0.25, else very threatened. */
    LEVELS: [-0.2, -0.05, 0.1, 0.25],
    /** Base chance of the board saying yes, by level 1..5 (an interim / vacancy: VACANT). */
    BASE: [0.02, 0.05, 0.12, 0.35, 0.6],
    VACANT: 0.75,
    /** The club's prestige above reputation / 100 + FIT_SLACK costs FIT_SLOPE per unit; never below FIT_FLOOR. */
    FIT_SLACK: 0.05,
    FIT_SLOPE: 4,
    FIT_FLOOR: 0.05,
    /** Answer after MIN..MAX days; a refusal blocks the same club for RETRY_DAYS. */
    ANSWER_MIN_DAYS: 3,
    ANSWER_MAX_DAYS: 6,
    RETRY_DAYS: 90,
    /** The offer that comes out of an accepted application is valid this many days. */
    VALID_DAYS: 14,
  },

  /** "Available on the market" while employed (8.9.23). */
  seeking: {
    MIN: 1,
    MAX: 3,
    /** First batch FIRST_OFFER_DAYS after switching it on, then one every EVERY_DAYS. */
    FIRST_OFFER_DAYS: 7,
    EVERY_DAYS: 14,
    VALID_DAYS: 14,
    /** Smaller clubs than in the normal band: he wants out. */
    EXTRA_BELOW: 0.15,
    /** Board confidence lost on the 1st of every month while it is on. */
    BOARD_PER_MONTH: 3,
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

  /**
   * A club happy with its manager makes no offer (10.6.4): job security at this level or safer (1 very secure,
   * 2 secure), or a title won with him in the last `TITLE_DAYS`. `EXTRA_DRAWS`: how many more clubs may be drawn to
   * replace the happy ones.
   */
  content: { LEVEL: 2, TITLE_DAYS: 365, EXTRA_DRAWS: 12 },

  /** Season-end offers without a known first match of the new season stay this long. */
  SEASON_END_FALLBACK_DAYS: 30,
} as const;
