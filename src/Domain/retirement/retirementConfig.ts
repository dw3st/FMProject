/** Retirement + reborn constants (`.claude/rules/game/retirement.md`). */
export const RETIREMENT = {
  /** Base retirement chance by age (>= the last key behaves like the last key). */
  BASE_BY_AGE: { 34: 0.10, 35: 0.25, 36: 0.45, 37: 0.65, 38: 0.85, 39: 1.0 } as Record<number, number>,
  MIN_AGE: 34,
  /** Age at or above which retirement is certain. */
  FORCED_AGE: 40,
  /** Level factor = LEVEL_BASE - LEVEL_SLOPE * percentile (0 = worst of the line, 1 = best). */
  LEVEL_BASE: 1.3,
  LEVEL_SLOPE: 0.6,
  /** Free agents retire with age + this. */
  FREE_AGENT_AGE_BONUS: 1,
  /** A retiree among the best N of the world (by overall) is "world class". */
  WORLD_CLASS_TOP: 50,
  /** Reborn: age of the new academy player and level = line average - this. */
  REBORN_AGE: 17,
  REBORN_LEVEL_OFFSET: 0.8,
  REBORN_LEVEL_MIN: 1.5,
  REBORN_LEVEL_MAX: 8,
  /** Reborn grows faster (DP multiplier) until this age. */
  REBORN_DP_MULT: 1.3,
  REBORN_UNTIL_AGE: 23,
  /**
   * Bringing a retired legend back for money (tester report): one per season per manager, fee by his level at
   * retirement, `FEE_MIN + FEE_PER_LEVEL × (level − FEE_PIVOT)` within [FEE_MIN, FEE_MAX], on the €0.1M grid.
   */
  LEGEND_HIRE: { FEE_MIN: 2_000_000, FEE_MAX: 10_000_000, FEE_PER_LEVEL: 4_000_000, FEE_PIVOT: 4.5 },
  /**
   * A legend of the retired list: level at retirement at least this (45 on the screen), or world class. Nobody
   * retires in the world's top 50 (they decline from 34), so world class alone left the list empty.
   */
  LEGEND_MIN_LEVEL: 4.5,
  /**
   * "Highlights" filter of the retired list (tester report: average players fill it): level at retirement at least
   * this. Friends world of 2027-01: 250 of 1633 club retirees (the top ~15%).
   */
  NOTABLE_MIN_LEVEL: 3.5,
} as const;
