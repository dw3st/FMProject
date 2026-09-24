import { Player } from "@/Domain/Player";
import { AI_FINANCE_CONFIG, FINANCIAL_TIERS } from "@/Domain/aiFinance/aiFinanceConfig";
import type { ClubFinances, FinancialTier, RosterPlayer, Squad } from "@/types/playerTypes";
import type { TransferBudgetTier } from "@/types/transferMarketTypes";

/**
 * Simplified AI club finances (`.claude/rules/AI-clubs/finance.md`): tier + popularity → weekly
 * budget → wage cap, and tier + popularity → seasonal transfer budget. AI clubs never track a
 * money balance (`finances.budget` is the human club's only). Pure functions only; nothing here
 * reads or writes the save.
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
  /** Transfer money left this season (€). */
  transferBudget: number;
  /** This season's full grant (€) for the current tier + popularity. */
  seasonalTransferBudget: number;
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

export function popularityOf(squad: Squad): number {
  return popularityFromFollowers(squad.finances?.followers ?? 0);
}

/** Seasonal AI transfer grant (€): `BASE_SEASONAL[tier] × (1 + popularity/100) × SOFT_BALANCE[tier]`. */
export function seasonalTransferBudgetFor(tier: FinancialTier, popularity: number): number {
  const c = AI_FINANCE_CONFIG;
  return Math.round(c.TRANSFER_BUDGET.BASE_SEASONAL[tier] * (1 + clamp(popularity, 0, 100) / 100) * c.SOFT_BALANCE[tier]);
}

/** Transfer money an AI club has left this season; the full grant until it first spends or sells. */
export function aiTransferBudgetOf(squad: Squad): number {
  return squad.aiTransferBudget ?? seasonalTransferBudgetFor(financialTierOf(squad), popularityOf(squad));
}

/** Market budget band (price caps, sell-list depth) of an AI club, from its financial tier. */
export function transferBudgetTierOf(squad: Squad): TransferBudgetTier {
  const tier = financialTierOf(squad);
  if (tier === "LOW") return "low";
  if (tier === "MEDIUM") return "mid";
  return "high";
}

/** AI seller's financial pressure (0..1) — how eager it is to cash in — from its tier. */
export function aiFinancialPressure(squad: Squad): number {
  return AI_FINANCE_CONFIG.FINANCIAL_PRESSURE[financialTierOf(squad)];
}

/** AI buyer paid `fee`: it leaves this season's transfer budget (never below 0). */
export function applyAITransferSpend(squad: Squad, fee: number): Squad {
  return { ...squad, aiTransferBudget: Math.max(0, aiTransferBudgetOf(squad) - Math.max(0, fee)) };
}

/**
 * AI seller received `fee`: `SALE_RETURN_RATIO` of it goes back into the transfer budget, capped at
 * `MAX_BALANCE_RATIO ×` the seasonal grant (a budget already above the cap is not reduced).
 */
export function applyAITransferSale(squad: Squad, fee: number): Squad {
  const tb = AI_FINANCE_CONFIG.TRANSFER_BUDGET;
  const current = aiTransferBudgetOf(squad);
  const cap = seasonalTransferBudgetFor(financialTierOf(squad), popularityOf(squad)) * tb.MAX_BALANCE_RATIO;
  const next = Math.min(current + Math.max(0, fee) * tb.SALE_RETURN_RATIO, Math.max(current, cap));
  return { ...squad, aiTransferBudget: Math.round(next) };
}

export function aiClubFinance(squad: Squad): AIClubFinance {
  const tier = financialTierOf(squad);
  const popularity = popularityOf(squad);
  const weeklyBudget = weeklyBudgetFor(tier, popularity);
  const maxWageBudget = maxWageBudgetFor(weeklyBudget);
  const wageBill = squadWageBill(squad);
  return {
    tier, popularity, weeklyBudget, maxWageBudget, wageBill,
    hiring: hiringStateFor(wageBill, maxWageBudget),
    transferBudget: aiTransferBudgetOf(squad),
    seasonalTransferBudget: seasonalTransferBudgetFor(tier, popularity),
  };
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
