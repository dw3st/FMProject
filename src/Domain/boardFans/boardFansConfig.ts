/**
 * Board and fans (`.claude/rules/game/board-fans.md`, Etapa 17). Every tunable number of the
 * human club's two confidence meters lives here; AI clubs simulate nothing.
 */
export const BOARD_FANS = {
  /** Both meters start here and drift back towards it. */
  START: 60,
  MIN: 0,
  MAX: 100,
  /** Daily snapshots kept in `BoardState.history` (the dashboard trend compares with 7 days ago). */
  HISTORY_DAYS: 14,
  TREND_DAYS: 7,
  /** Official results remembered for the fans' form term. */
  RECENT_RESULTS: 5,

  match: {
    /** Fans per result. */
    FANS_WIN: 2.5,
    FANS_DRAW: -0.3,
    FANS_LOSS: -2.5,
    /** A home defeat hurts more. */
    HOME_LOSS_MULT: 1.5,
    /** Derby / big match: the whole result delta. */
    DERBY_MULT: 1.5,
    /** Fans: (points in the last 5 official games − FORM_PIVOT) × FORM_WEIGHT. */
    FORM_PIVOT: 7,
    FORM_WEIGHT: 0.3,
    /** Board per result. */
    BOARD_WIN: 0.8,
    BOARD_DRAW: 0,
    BOARD_LOSS: -0.8,
    /** Board per league match: POSITION_WEIGHT × (target − position) / leagueSize × season weight. */
    POSITION_WEIGHT: 2.5,
    /** Season weight = SEASON_WEIGHT_MIN + (1 − SEASON_WEIGHT_MIN) × played / total. */
    SEASON_WEIGHT_MIN: 0.4,
  },

  events: {
    TITLE_BOARD: 12,
    TITLE_FANS: 12,
    /** A cup/continental stage won (the "bonus" competitions). */
    STAGE_BOARD: 1,
    STAGE_FANS: 1.5,
    /** Knocked out early: cup before the quarter-finals, continental in the group stage. */
    EARLY_EXIT_BOARD: -2.5,
    EARLY_EXIT_FANS: -2,
    PROMOTED_BOARD: 10,
    PROMOTED_FANS: 10,
    RELEGATED_BOARD: -15,
    RELEGATED_FANS: -12,
  },

  transfer: {
    /** A sale worth at least this share of the annual revenue is a "big profit" for the board. */
    BIG_SALE_REVENUE_SHARE: 0.1,
    BIG_SALE_BOARD: 3,
    /** A purchase that leaves the balance negative. */
    OVER_BUDGET_BOARD: -4,
    /** Selling the squad's best player, or one with at least IDOL_SEASONS seasons at the club. */
    IDOL_SALE_FANS: -8,
    IDOL_SEASONS: 4,
  },

  weekly: {
    /** Negative balance: NEG_BASE plus up to NEG_EXTRA_MAX more the deeper it is (in weeks of revenue). */
    NEG_BASE: -1,
    NEG_EXTRA_MAX: -1.5,
    NEG_DEPTH_WEEKS: 8,
    POSITIVE: 0.2,
    /** Share of the gap to START closed every week (no events: the mood normalises). */
    BOARD_DRIFT: 0.02,
    FANS_DRIFT: 0.03,
  },

  season: {
    /** Objective met: MET_BASE + MET_SCALE × (target − position) / size, at most MET_MAX. */
    MET_BASE: 8,
    MET_SCALE: 12,
    MET_MAX: 15,
    /** Objective missed: −(MISS_BASE + MISS_SCALE × (position − target) / size), at most MISS_MAX. */
    MISS_BASE: 6,
    MISS_SCALE: 30,
    MISS_MAX: 20,
    /** After the evaluation both meters keep this share of their distance to START. */
    CARRY: 0.5,
    /** Board ≥ this at the end of the season → budget bonus. */
    BONUS_THRESHOLD: 75,
    /** Bonus = revenue × (BONUS_BASE + BONUS_SPAN × (board − threshold) / (100 − threshold)). */
    BONUS_BASE: 0.02,
    BONUS_SPAN: 0.04,
  },

  status: {
    /** Below: a warning (once per downward crossing; re-armed at WARNING_RESET). */
    WARNING: 35,
    WARNING_RESET: 40,
    /** Below: an ultimatum (sacking enabled only). */
    ULTIMATUM: 25,
    ULTIMATUM_MATCHES: 5,
    ULTIMATUM_POINTS: 7,
    /** Ultimatum met: the board relaxes a little. */
    ULTIMATUM_MET_BOARD: 5,
    /** Below: sacked (sacking enabled only). */
    SACK: 15,
    /** Above: praise (once per upward crossing; re-armed at PRAISE_RESET). */
    PRAISE: 80,
    PRAISE_RESET: 70,
  },

  objective: {
    /** Expected position ≤ this → title. */
    TITLE_RANK: 2,
    /** Strength bonus by financial tier when ranking the league (club level units). */
    TIER_LEVEL_BONUS: { LOW: -0.1, MEDIUM: 0, HIGH: 0.1, ELITE: 0.2 },
    /** Expected position within this many places of the relegation zone → avoid relegation. */
    RELEGATION_MARGIN: 2,
    /** Mid-table target as a share of the league size (capped above the relegation zone). */
    MID_TABLE_SHARE: 0.7,
  },

  gate: {
    /** Stadium fill by fans: 0 → MIN, START → DEFAULT (the AI/neutral fill rate), 100 → MAX. */
    FILL_MIN: 0.45,
    FILL_MAX: 0.9,
  },

  followers: {
    /** Followers gain multiplier at the rollover: 0 → MIN, START → 1, 100 → MAX. */
    MULT_MIN: 0.8,
    MULT_MAX: 1.2,
  },
} as const;
