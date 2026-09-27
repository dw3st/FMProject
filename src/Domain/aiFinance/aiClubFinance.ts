import { AI_FINANCE_CONFIG, FINANCIAL_TIERS } from "@/Domain/aiFinance/aiFinanceConfig";
import { FALLBACK_HOME_GAMES, playerWeeklyWage, squadWeeklyWages, wageFactorOf, wageRevenueBasisOf } from "@/Domain/finance/wages";
import type { ClubFinances, FinancialTier, RosterPlayer, Squad } from "@/types/playerTypes";
import type { TransferBudgetTier } from "@/types/transferMarketTypes";

/**
 * Simplified AI club finances (`.claude/rules/AI-clubs/finance.md`): tier + popularity → seasonal
 * transfer budget, and tier + estimated annual revenue (`src/Domain/finance/wages.ts`) → wage cap
 * that gates hiring in the AI transfer market. AI clubs never track a money balance
 * (`finances.budget` is the human club's only). Pure functions only; nothing here reads or writes
 * the save.
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

/**
 * Estimated weekly wage (€) of a player at a specific club: the shared rating curve
 * (`weeklyWage`, `src/Domain/finance/wages.ts`) times that club's wage factor. Wages are no
 * longer a flat function of rating alone — the same player costs a different amount at a rich
 * club than at a poor one, so callers must pass the BUYING club's factor (`wageFactorOf`), not
 * the selling club's.
 */
export function estimateWeeklyWage(player: RosterPlayer, factor: number): number {
  return playerWeeklyWage(player, factor);
}

/** A squad's current wage bill (€/week) at its own wage factor. */
export function squadWageBill(squad: Squad, homeGames: number = FALLBACK_HOME_GAMES): number {
  return squadWeeklyWages(squad.players, wageFactorOf(squad, homeGames));
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

/**
 * The wage cap: `WAGE_REVENUE_SHARE × annual revenue / 52 × SOFT_BALANCE[tier]`. Unlike the old
 * popularity-derived budget, this is driven by the club's own estimated revenue
 * (`clubAnnualRevenue`, `src/Domain/finance/wages.ts`) — the same revenue basis the actual wage
 * bill is calibrated against (`wageConfig.ts` TARGET_SHARE), just with more headroom
 * (`WAGE_REVENUE_SHARE` > `TARGET_SHARE`) so a club spending near its calibrated bill still reads
 * as "open" to hire.
 */
export function maxWageBudgetFor(revenue: number, tier: FinancialTier): number {
  return Math.round(AI_FINANCE_CONFIG.WAGE_REVENUE_SHARE * (revenue / 52) * AI_FINANCE_CONFIG.SOFT_BALANCE[tier]);
}

/** Headline "weekly budget" figure shown in the UI — the wage cap scaled back up by WAGE_RATIO; not itself a cap. */
export function weeklyBudgetFor(maxWageBudget: number): number {
  return Math.round(maxWageBudget / AI_FINANCE_CONFIG.WAGE_RATIO);
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

/**
 * `homeGames` only matters as a fallback: the revenue used for the wage cap is
 * `wageRevenueBasisOf(squad, homeGames)` — the SAME basis the squad's stored `wageFactor` was set
 * against (career creation or the last season rollover), not a fresh `clubAnnualRevenue` guess.
 * Reading the stored basis (rather than recomputing revenue with a possibly-wrong `homeGames`,
 * e.g. the generic `FALLBACK_HOME_GAMES` default) keeps the cap and the actual wage bill — which
 * also comes from the stored factor via `squadWageBill` → `wageFactorOf` — in agreement about the
 * club's league size. `homeGames` is only actually used when the squad has no stored basis yet.
 */
export function aiClubFinance(squad: Squad, homeGames: number = FALLBACK_HOME_GAMES): AIClubFinance {
  const tier = financialTierOf(squad);
  const popularity = popularityOf(squad);
  const revenue = wageRevenueBasisOf(squad, homeGames);
  const maxWageBudget = maxWageBudgetFor(revenue, tier);
  const weeklyBudget = weeklyBudgetFor(maxWageBudget);
  const wageBill = squadWageBill(squad, homeGames);
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
