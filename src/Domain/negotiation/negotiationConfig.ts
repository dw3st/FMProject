/**
 * Negotiation, sell-on clauses and loans (`.claude/rules/game/negotiation.md`). Every tunable
 * number of Etapa 21 lives here.
 */
export const NEGOTIATION = {
  /** Seller accepts at this decision score (the counter-offer targets it). */
  ACCEPT_SCORE: 0.8,
  /** Below this score the seller refuses instead of countering. */
  COUNTER_MIN_SCORE: 0.45,
  /** Relative strength (rating − team average) of a "star": always countered, never cheap. */
  STAR_GAP: 0.5,
  /** A star is never sold below this share of his value. */
  STAR_MIN_OFFER: 0.8,
  /** Offers per player per day. */
  ROUNDS_PER_DAY: 3,
  /** An offer below this share of the value ends the talks. */
  LOWBALL_RATIO: 0.6,
  LOWBALL_BAN_DAYS: 14,

  /** Sell-on percentages the UI offers. */
  SELL_ON_PCTS: [0, 10, 20, 30] as const,
  /** Value of every 10% of sell-on, as a share of the fee (young: ≤ YOUNG_AGE). */
  SELL_ON_VALUE_PER_10: 0.04,
  SELL_ON_VALUE_PER_10_YOUNG: 0.06,
  YOUNG_AGE: 23,

  /** AI bids for the human's players. */
  BID: {
    VALID_DAYS: 5,
    /** Opening fee = value × (FEE_MIN + rng × FEE_SPREAD), never above the club's max. */
    FEE_MIN: 0.85,
    FEE_SPREAD: 0.2,
    /** The most a club pays: value × MAX_RATIO (and its transfer budget / price cap). */
    MAX_RATIO: 1.25,
    /** A bid needs a max of at least this share of the value. */
    MIN_MAX_RATIO: 0.6,
    /** Chance the bid includes a sell-on clause for the human club (10 or 20%). */
    SELL_ON_CHANCE: 0.25,
    /** Daily chance of a bid for an unlisted standout of the human squad. */
    UNLISTED_CHANCE: 0.03,
    /** Pending bids at a time. */
    MAX_PENDING: 6,
    /** Live transfer bids for the same player (from different clubs, D6). */
    MAX_PER_PLAYER: 2,
  },

  /** Rivals for the same target (Etapa 25, `.claude/rules/game/negotiation.md`). */
  RIVAL: {
    /** Chance a candidate enters = BASE × need urgency × (0,5 + 0,5 × relative rating of the target). */
    BASE: 0.25,
    MAX_PER_TARGET: 2,
    DEADLINE_DAYS: 3,
    /** The human must offer at least the best rival fee the seller accepts × FLOOR_MULT. */
    FLOOR_MULT: 1.05,
    /** A candidate needs a transfer budget of at least value × BUDGET_RATIO. */
    BUDGET_RATIO: 0.9,
    /** Rival fee = value × (FEE_MIN + rng × FEE_SPREAD); wage = demand × (1 + rng × WAGE_SPREAD). */
    FEE_MIN: 0.95,
    FEE_SPREAD: 0.2,
    WAGE_SPREAD: 0.1,
  },

  /** The player picks between two clubs the seller accepts (rival vs human, pre-contract vs renewal). */
  PREFERENCE: {
    WAGE: 0.45,
    PRESTIGE: 0.35,
    STARTER: 0.2,
    /** Wage term saturates at this multiple of his demand. */
    WAGE_CAP: 1.5,
  },

  /** Pre-contract with an AI player whose contract ends within this many days (D2). */
  PRE_CONTRACT_DAYS: 183,

  LOAN: {
    /** Fewer days than this to the season end → the loan runs to the next season's end. */
    SHORT_SEASON_DAYS: 60,
    /** The parent club counts this share of the wage it no longer pays. */
    WAGE_WEIGHT: 0.5,
    /**
     * Share of the wage the parent wants covered: BASE + SLOPE × relative strength, within
     * MIN..MAX (an average squad player: 75%; a weak one: 40%).
     */
    SHARE_BASE: 0.75,
    SHARE_SLOPE: 0.5,
    SHARE_MIN: 0.4,
    SHARE_MAX: 1,
    /** A player above the squad average also costs value × this × strength per season. */
    FEE_PER_STRENGTH: 0.04,
    SEASON_WEEKS: 40,
    /** Max age of a young loanee (any club lends him when he is not a starter). */
    YOUNG_AGE: 23,
    /** Daily chance per loan-listed player that an AI club bids. */
    BID_CHANCE: 0.35,
    /** Share of the wage AI borrowers offer: MIN..1 in steps of 0.1. */
    BID_MIN_SHARE: 0.5,
  },
} as const;
