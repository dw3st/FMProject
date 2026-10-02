/** Manager ranking constants (`.claude/rules/game/managers.md`). */
export const MANAGERS = {
  POINTS: {
    /** League title, tier 1 (× country weight). */
    LEAGUE_TOP: 100,
    /** League title, tier 2 or lower (× country weight). */
    LEAGUE_LOWER: 40,
    /** National cup (× country weight). */
    CUP: 50,
    /** Champions League / Libertadores. */
    CONTINENTAL_PRIMARY: 150,
    /** Europa League / Sul-Americana. */
    CONTINENTAL_SECONDARY: 80,
    /** Promotion to a higher tier. */
    PROMOTION: 20,
  },
  /** Country weight = tier-1 level ÷ big-5 level, clamped to this range. */
  WEIGHT_MIN: 0.2,
  WEIGHT_MAX: 1.2,
  /** Countries whose tier-1 average level is the weight reference (leagueData `country`). */
  BIG5: ["England", "Spain", "Germany", "Italy", "France"],
} as const;
