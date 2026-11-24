/** Youth trials (`.claude/rules/game/youth.md` → "Peneira de jovens", spec 2026-11-24). */
export const YOUTH_TRIAL = {
  /** Youngsters seen and cost (share of the yearly revenue basis) by size. */
  SIZES: {
    small:  { count: 20, share: 0.002 },
    medium: { count: 40, share: 0.005 },
    large:  { count: 60, share: 0.01 },
  },
  AGES: [15, 16, 17] as const,
  MIN_DAYS: 14,
  MAX_DAYS: 28,
  PER_SEASON: 2,
  /** Days the results stay open to sign. */
  RESULTS_DAYS: 14,
  /** Below the club's line average (the yearly intake uses 1.8: amateurs are a step below). */
  LEVEL_OFFSET: 2.2,
  LEVEL_SIGMA: 0.5,
  GEM_CHANCE: 0.004,
  GEM_BONUS: 1.0,
  /** The gem tag: the level the youth coach sees is at least this much above an ordinary trialist's mean. */
  GEM_SEEN_ABOVE: 1.2,
  /** Gem chance × by the youth coach's stars [1★, 3★, 5★]; none = 2★. */
  COACH_GEM: [0.75, 1, 1.4] as const,
  /** Knowledge of the results by the youth coach's stars [1★, 3★, 5★]; none = 2★. */
  KNOWLEDGE: [30, 50, 70] as const,
  FAME_STEP: 0.25,
  FAME_MAX: 2,
  SIGN_MAX: 18,
  REVEAL: {
    FIRST_TEAM_OVERALL: 6.0,
    WORLD_TOP: 100,
    SOLD_FEE: 10_000_000,
  },
  REWARD: {
    FOLLOWERS: 0.02,
    FANS: 3,
    REP_MAX: 5,
    /** Reputation of a world-top reveal (a plain one gives 1). */
    REP_TOP: 2,
  },
};
