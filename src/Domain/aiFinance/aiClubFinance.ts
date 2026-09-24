import { Player } from "@/Domain/Player";
import { AI_FINANCE_CONFIG, FINANCIAL_TIERS } from "@/Domain/aiFinance/aiFinanceConfig";
import type { ClubFinances, FinancialTier, RosterPlayer, Squad } from "@/types/playerTypes";

/**
 * Simplified AI club finances (`.claude/rules/AI-clubs/finance.md`): tier + popularity → weekly
 * budget → wage cap. Pure functions only; nothing here reads or writes the save.
 */

export type HiringState = "open" | "tight" | "frozen";

export interface AIClubFinance {
  tier: FinancialTier;
  /** 0..100, from followers. */
  popularity: number;
  weeklyBudget: number;
  maxWageBudget: number;
  wageBill: number;
  /** open: hire freely (within the cap) · tight: only cheap cover signings · frozen: no hiring. */
  hiring: HiringState;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function tierIndex(tier: FinancialTier): number {
  return FINANCIAL_TIERS.indexOf(tier);
}

export function tierAt(index: number): FinancialTier {
  return FINANCIAL_TIERS[clamp(Math.round(index), 0, FINANCIAL_TIERS.length - 1)]!;
}

/** Estimated weekly wage (€) of a player. Also used for the human club's weekly P/L. */
export function estimateWeeklyWage(player: RosterPlayer): number {
  return Math.round(Math.pow(Player.overallAvg(player), AI_FINANCE_CONFIG.WAGE_EXPONENT) * AI_FINANCE_CONFIG.WAGE_SCALE);
}

export function squadWageBill(squad: Squad): number {
  return squad.players.reduce((sum, p) => sum + estimateWeeklyWage(p), 0);
}

/** Followers → popularity 0..100 on a log scale. */
export function popularityFromFollowers(followers: number): number {
  const { POPULARITY_LOG10_MIN: lo, POPULARITY_LOG10_MAX: hi } = AI_FINANCE_CONFIG;
  const log = Math.log10(Math.max(1, followers));
  return clamp(((log - lo) / (hi - lo)) * 100, 0, 100);
}

/** Tier implied by annual income (broadcasting + commercial). A club with no finances is LOW. */
export function naturalFinancialTier(finances: ClubFinances | undefined): FinancialTier {
  const income = (finances?.broadcasting ?? 0) + (finances?.commercial ?? 0);
  const t = AI_FINANCE_CONFIG.TIER_INCOME_THRESHOLDS;
  if (income >= t.ELITE) return "ELITE";
  if (income >= t.HIGH) return "HIGH";
  if (income >= t.MEDIUM) return "MEDIUM";
  return "LOW";
}

/** Stored tier (set at season rollover) or, before the club's first rollover, its natural tier. */
export function financialTierOf(squad: Squad): FinancialTier {
  return squad.financialTier ?? naturalFinancialTier(squad.finances);
}

/** `weeklyBudget = baseByTier × (1 + popularity/100)`, times the hidden soft-balance factor. */
export function weeklyBudgetFor(tier: FinancialTier, popularity: number): number {
  const c = AI_FINANCE_CONFIG;
  return Math.round(c.BASE_WEEKLY_BUDGET[tier] * (1 + clamp(popularity, 0, 100) / 100) * c.SOFT_BALANCE[tier]);
}

export function maxWageBudgetFor(weeklyBudget: number): number {
  return Math.round(weeklyBudget * AI_FINANCE_CONFIG.WAGE_RATIO);
}

export function hiringStateFor(wageBill: number, maxWageBudget: number): HiringState {
  if (wageBill >= maxWageBudget) return "frozen";
  if (wageBill >= maxWageBudget * AI_FINANCE_CONFIG.NEAR_LIMIT_RATIO) return "tight";
  return "open";
}

export function aiClubFinance(squad: Squad): AIClubFinance {
  const tier = financialTierOf(squad);
  const popularity = popularityFromFollowers(squad.finances?.followers ?? 0);
  const weeklyBudget = weeklyBudgetFor(tier, popularity);
  const maxWageBudget = maxWageBudgetFor(weeklyBudget);
  const wageBill = squadWageBill(squad);
  return { tier, popularity, weeklyBudget, maxWageBudget, wageBill, hiring: hiringStateFor(wageBill, maxWageBudget) };
}

/**
 * Wage control for one signing: never hire when frozen, never let the wage bill pass the cap,
 * and while tight only accept a fee within the tier's cheap cap.
 */
export function passesWageGate(fin: AIClubFinance, candidateWeeklyWage: number, fee: number): boolean {
  if (fin.hiring === "frozen") return false;
  if (fin.wageBill + candidateWeeklyWage > fin.maxWageBudget) return false;
  if (fin.hiring === "tight" && fee > AI_FINANCE_CONFIG.CHEAP_FEE_CAP[fin.tier]) return false;
  return true;
}
