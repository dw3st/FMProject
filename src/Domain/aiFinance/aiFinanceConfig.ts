import type { FinancialTier } from "@/types/playerTypes";

/**
 * Every tunable of the simplified AI club finance model (`.claude/rules/AI-clubs/finance.md`).
 * AI clubs never simulate revenue/expenses: they get a financial tier, a weekly budget derived
 * from tier + popularity, and a wage cap that gates hiring in the AI transfer market.
 *
 * Money units: `BASE_WEEKLY_BUDGET`, wages and wage budgets are € per week on the same scale as
 * `estimateWeeklyWage` (rating^2.2 × 50); fees and income are € (transfer / annual scale).
 */

/** Ordered weakest → strongest; index arithmetic (tier moves) relies on this order. */
export const FINANCIAL_TIERS: readonly FinancialTier[] = ["LOW", "MEDIUM", "HIGH", "ELITE"] as const;

export const AI_FINANCE_CONFIG = {
  /**
   * Natural tier from annual income (broadcasting + commercial, €). Income already reflects the
   * league tier (importer calibration + `applyTierFinanceChange`) and — unlike `budget` — does not
   * move with every transfer, so the derivation is stable. World split at start ≈ 24% / 53% / 19% / 3%.
   */
  TIER_INCOME_THRESHOLDS: { MEDIUM: 15_000_000, HIGH: 80_000_000, ELITE: 200_000_000 },

  /** Popularity 0..100 from followers on a log scale: 100k → 0, ~316M → 100. */
  POPULARITY_LOG10_MIN: 5,
  POPULARITY_LOG10_MAX: 8.5,

  /** `weeklyBudget = BASE_WEEKLY_BUDGET[tier] × (1 + popularity/100) × SOFT_BALANCE[tier]`. */
  BASE_WEEKLY_BUDGET: { LOW: 22_000, MEDIUM: 28_000, HIGH: 42_000, ELITE: 50_000 } as Record<FinancialTier, number>,
  /** Hidden balancing: weak clubs get a small boost, strong clubs a small limit. */
  SOFT_BALANCE: { LOW: 1.1, MEDIUM: 1.03, HIGH: 1.0, ELITE: 0.95 } as Record<FinancialTier, number>,
  /** `maxWageBudget = weeklyBudget × WAGE_RATIO` (design range 0.6–0.8). */
  WAGE_RATIO: 0.8,

  /** Estimated weekly wage of a player: `rating^WAGE_EXPONENT × WAGE_SCALE` (shared with FinancialService). */
  WAGE_EXPONENT: 2.2,
  WAGE_SCALE: 50,

  /** wageBill ≥ NEAR_LIMIT_RATIO × maxWageBudget → "tight": only cheap cover signings. */
  NEAR_LIMIT_RATIO: 0.9,
  /** Max fee (€) of a "cheap" signing while tight. */
  CHEAP_FEE_CAP: { LOW: 2_000_000, MEDIUM: 5_000_000, HIGH: 12_000_000, ELITE: 25_000_000 } as Record<FinancialTier, number>,

  /**
   * AI transfer money comes from the tier, never from an accumulated balance.
   * `seasonal = BASE_SEASONAL[tier] × (1 + popularity/100) × SOFT_BALANCE[tier]` (€), granted at
   * every rollover (and implied at world start). Fees paid reduce it within the season; a sale gives
   * back `SALE_RETURN_RATIO × fee`, never lifting it above `MAX_BALANCE_RATIO × seasonal`.
   */
  TRANSFER_BUDGET: {
    BASE_SEASONAL: { LOW: 3_000_000, MEDIUM: 12_000_000, HIGH: 40_000_000, ELITE: 100_000_000 } as Record<FinancialTier, number>,
    SALE_RETURN_RATIO: 0.5,
    MAX_BALANCE_RATIO: 1.5,
  },

  /** AI seller's willingness to cash in (evaluateTransferOffer `financialPressure`), by tier. */
  FINANCIAL_PRESSURE: { LOW: 1.0, MEDIUM: 0.5, HIGH: 0.25, ELITE: 0.1 } as Record<FinancialTier, number>,

  season: {
    /** Final-table fraction (0 = champion, 1 = last) at or below which the season is "good". */
    TOP_FRAC: 0.15,
    /** Final-table fraction at or above which the season is "bad". */
    BOTTOM_FRAC: 0.85,
    /** Followers change for the best / worst possible finish (linear in between, 0 at mid-table). */
    FOLLOWERS_GOOD_GAIN: 0.1,
    FOLLOWERS_BAD_LOSS: 0.04,
    CHAMPION_BONUS: 0.05,
    PROMOTED_BONUS: 0.1,
    RELEGATED_LOSS: 0.06,
    /** Soft balancing on followers: gains/losses scaled per tier (weak gain more, strong lose more). */
    GAIN_MULT: { LOW: 1.25, MEDIUM: 1.1, HIGH: 1.0, ELITE: 0.8 } as Record<FinancialTier, number>,
    LOSS_MULT: { LOW: 0.75, MEDIUM: 0.9, HIGH: 1.0, ELITE: 1.2 } as Record<FinancialTier, number>,
    FOLLOWERS_FLOOR: 1_000,
    /** A club's tier never drifts more than this many steps from its natural (income) tier. */
    MAX_DRIFT_FROM_NATURAL: 1,
  },
} as const;
