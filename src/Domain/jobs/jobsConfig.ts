/** Job offers to the human manager (`.claude/rules/game/jobs.md`, Etapa 20). Every tunable number. */
export const JOBS = {
  reputation: {
    /** Shares of the 0..100 reputation. */
    RANK_WEIGHT: 45,
    BOARD_WEIGHT: 30,
    TITLES_WEIGHT: 15,
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
    /** Expected offers λ = BASE × e^(K × (reputation − PIVOT)): 40 → 0.3, 80 → ~2. */
    BASE: 0.3,
    PIVOT: 40,
    K: 0.0474,
    MAX: 3,
  },

  midSeason: {
    /** Only with reputation ≥ MIN_REPUTATION or board ≥ MIN_BOARD. */
    MIN_REPUTATION: 60,
    MIN_BOARD: 80,
    /** Share of the league's rounds the player's club has played before the window opens. */
    PROGRESS: 0.5,
    VALID_DAYS: 7,
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

  /** Season-end offers without a known first match of the new season stay this long. */
  SEASON_END_FALLBACK_DAYS: 30,
} as const;
