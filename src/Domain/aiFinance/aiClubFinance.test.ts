import { describe, expect, test } from "bun:test";
import type { ClubFinances, RosterPlayer, Squad } from "@/types/playerTypes";
import {
  aiClubFinance,
  aiFinancialPressure,
  aiTransferBudgetOf,
  applyAITransferSale,
  applyAITransferSpend,
  seasonalTransferBudgetFor,
  transferBudgetTierOf,
  estimateWeeklyWage,
  financialTierOf,
  hiringStateFor,
  maxWageBudgetFor,
  naturalFinancialTier,
  passesWageGate,
  popularityFromFollowers,
  squadWageBill,
  weeklyBudgetFor,
} from "@/Domain/aiFinance/aiClubFinance";
import { AI_FINANCE_CONFIG } from "@/Domain/aiFinance/aiFinanceConfig";

const fin = (income: number, followers = 0, budget = 10_000_000): ClubFinances => ({
  broadcasting: income, commercial: 0, total: income, budget, followers,
});

function player(id: string, overallAvg: number): RosterPlayer {
  return {
    id, name: id, age: 25, squadId: "s", preferredFoot: "right", positions: ["CM"],
    stats: { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5,
      pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5 },
    profile: { summary: "", archetype: "" },
    overallAvg,
  };
}

const squad = (finances?: ClubFinances, players: RosterPlayer[] = [], extra: Partial<Squad> = {}): Squad => ({
  id: "s", name: "S", colors: ["#000", "#fff"], money: 0, players, finances, ...extra,
});

describe("naturalFinancialTier", () => {
  test("income thresholds", () => {
    expect(naturalFinancialTier(undefined)).toBe("LOW");
    expect(naturalFinancialTier(fin(14_999_999))).toBe("LOW");
    expect(naturalFinancialTier(fin(15_000_000))).toBe("MEDIUM");
    expect(naturalFinancialTier(fin(80_000_000))).toBe("HIGH");
    expect(naturalFinancialTier(fin(200_000_000))).toBe("ELITE");
  });
  test("uses broadcasting + commercial, not budget", () => {
    expect(naturalFinancialTier({ ...fin(0, 0, 900_000_000), broadcasting: 50_000_000, commercial: 40_000_000 })).toBe("HIGH");
  });
  test("stored tier wins over the natural one", () => {
    expect(financialTierOf(squad(fin(0)))).toBe("LOW");
    expect(financialTierOf(squad(fin(0), [], { financialTier: "HIGH" }))).toBe("HIGH");
  });
});

describe("popularityFromFollowers", () => {
  test("log scale clamped to 0..100", () => {
    expect(popularityFromFollowers(0)).toBe(0);
    expect(popularityFromFollowers(100_000)).toBe(0);
    expect(popularityFromFollowers(10 ** 8.5)).toBeCloseTo(100);
    expect(popularityFromFollowers(1e10)).toBe(100);
    expect(popularityFromFollowers(10 ** 6.75)).toBeCloseTo(50);
  });
});

describe("budget math", () => {
  test("weeklyBudget = base × (1 + popularity/100) × soft balance", () => {
    const c = AI_FINANCE_CONFIG;
    expect(weeklyBudgetFor("HIGH", 0)).toBe(c.BASE_WEEKLY_BUDGET.HIGH);
    expect(weeklyBudgetFor("HIGH", 50)).toBe(Math.round(c.BASE_WEEKLY_BUDGET.HIGH * 1.5));
    expect(weeklyBudgetFor("LOW", 0)).toBe(Math.round(c.BASE_WEEKLY_BUDGET.LOW * c.SOFT_BALANCE.LOW));
    expect(weeklyBudgetFor("ELITE", 100)).toBe(Math.round(c.BASE_WEEKLY_BUDGET.ELITE * 2 * c.SOFT_BALANCE.ELITE));
  });
  test("maxWageBudget = weeklyBudget × wageRatio (0.6–0.8)", () => {
    expect(AI_FINANCE_CONFIG.WAGE_RATIO).toBeGreaterThanOrEqual(0.6);
    expect(AI_FINANCE_CONFIG.WAGE_RATIO).toBeLessThanOrEqual(0.8);
    expect(maxWageBudgetFor(10_000)).toBe(Math.round(10_000 * AI_FINANCE_CONFIG.WAGE_RATIO));
  });
  test("stronger tiers always get a bigger budget at equal popularity", () => {
    for (const p of [0, 50, 100]) {
      expect(weeklyBudgetFor("MEDIUM", p)).toBeGreaterThan(weeklyBudgetFor("LOW", p));
      expect(weeklyBudgetFor("HIGH", p)).toBeGreaterThan(weeklyBudgetFor("MEDIUM", p));
      expect(weeklyBudgetFor("ELITE", p)).toBeGreaterThan(weeklyBudgetFor("HIGH", p));
    }
  });
  test("wage estimate and wage bill", () => {
    expect(estimateWeeklyWage(player("a", 4))).toBe(Math.round(Math.pow(4, 2.2) * 50));
    expect(squadWageBill(squad(undefined, [player("a", 4), player("b", 2)])))
      .toBe(estimateWeeklyWage(player("a", 4)) + estimateWeeklyWage(player("b", 2)));
  });
});

describe("wage gate", () => {
  test("hiring states", () => {
    expect(hiringStateFor(0, 1000)).toBe("open");
    expect(hiringStateFor(899, 1000)).toBe("open");
    expect(hiringStateFor(900, 1000)).toBe("tight");
    expect(hiringStateFor(999, 1000)).toBe("tight");
    expect(hiringStateFor(1000, 1000)).toBe("frozen");
  });
  test("aiClubFinance puts it together", () => {
    const s = squad(fin(100_000_000, 10 ** 6.75), [player("a", 4)]);
    const f = aiClubFinance(s);
    expect(f.tier).toBe("HIGH");
    expect(f.popularity).toBeCloseTo(50);
    expect(f.weeklyBudget).toBe(weeklyBudgetFor("HIGH", f.popularity));
    expect(f.maxWageBudget).toBe(maxWageBudgetFor(f.weeklyBudget));
    expect(f.wageBill).toBe(estimateWeeklyWage(player("a", 4)));
    expect(f.hiring).toBe("open");
  });
  const base = { tier: "HIGH" as const, popularity: 0, weeklyBudget: 0, maxWageBudget: 10_000, transferBudget: 0, seasonalTransferBudget: 0 };
  test("open: any fee, as long as the wage fits", () => {
    const f = { ...base, wageBill: 5_000, hiring: "open" as const };
    expect(passesWageGate(f, 5_000, 90_000_000)).toBe(true);
    expect(passesWageGate(f, 5_001, 1)).toBe(false);
  });
  test("tight: only cheap players", () => {
    const f = { ...base, wageBill: 9_500, hiring: "tight" as const };
    const cheap = AI_FINANCE_CONFIG.CHEAP_FEE_CAP.HIGH;
    expect(passesWageGate(f, 400, cheap)).toBe(true);
    expect(passesWageGate(f, 400, cheap + 1)).toBe(false);
    expect(passesWageGate(f, 600, 1)).toBe(false);
  });
  test("frozen: never", () => {
    expect(passesWageGate({ ...base, wageBill: 10_000, hiring: "frozen" }, 0, 0)).toBe(false);
  });
});

describe("AI transfer budget (from the tier, no balance)", () => {
  const c = AI_FINANCE_CONFIG;
  test("seasonal grant = base × (1 + popularity/100) × soft balance", () => {
    expect(seasonalTransferBudgetFor("HIGH", 0)).toBe(c.TRANSFER_BUDGET.BASE_SEASONAL.HIGH);
    expect(seasonalTransferBudgetFor("MEDIUM", 50))
      .toBe(Math.round(c.TRANSFER_BUDGET.BASE_SEASONAL.MEDIUM * 1.5 * c.SOFT_BALANCE.MEDIUM));
    expect(seasonalTransferBudgetFor("ELITE", 0)).toBeGreaterThan(seasonalTransferBudgetFor("HIGH", 100) * 0.9);
  });
  test("absent = full grant; finances.budget is ignored for AI", () => {
    const s = squad(fin(100_000_000, 0, 999_000_000));
    expect(aiTransferBudgetOf(s)).toBe(seasonalTransferBudgetFor("HIGH", 0));
    expect(aiTransferBudgetOf({ ...s, aiTransferBudget: 1_234 })).toBe(1_234);
  });
  test("spending reduces it, never below 0", () => {
    const s = squad(fin(100_000_000), [], { aiTransferBudget: 10_000_000 });
    expect(applyAITransferSpend(s, 4_000_000).aiTransferBudget).toBe(6_000_000);
    expect(applyAITransferSpend(s, 40_000_000).aiTransferBudget).toBe(0);
    expect(applyAITransferSpend(s, 1).finances).toEqual(s.finances);
  });
  test("a sale gives back part of the fee, capped", () => {
    const seasonal = seasonalTransferBudgetFor("HIGH", 0);
    const s = squad(fin(100_000_000), [], { aiTransferBudget: 0 });
    expect(applyAITransferSale(s, 10_000_000).aiTransferBudget).toBe(10_000_000 * c.TRANSFER_BUDGET.SALE_RETURN_RATIO);
    const rich = { ...s, aiTransferBudget: seasonal };
    expect(applyAITransferSale(rich, 1_000_000_000).aiTransferBudget).toBe(Math.round(seasonal * c.TRANSFER_BUDGET.MAX_BALANCE_RATIO));
  });
  test("market band and financial pressure key off the tier", () => {
    expect(transferBudgetTierOf(squad(fin(0)))).toBe("low");
    expect(transferBudgetTierOf(squad(fin(20_000_000)))).toBe("mid");
    expect(transferBudgetTierOf(squad(fin(100_000_000)))).toBe("high");
    expect(transferBudgetTierOf(squad(fin(0), [], { financialTier: "ELITE" }))).toBe("high");
    expect(aiFinancialPressure(squad(fin(0)))).toBe(c.FINANCIAL_PRESSURE.LOW);
    expect(aiFinancialPressure(squad(fin(300_000_000)))).toBe(c.FINANCIAL_PRESSURE.ELITE);
  });
  test("aiClubFinance reports the transfer budget", () => {
    const f = aiClubFinance(squad(fin(20_000_000), [], { aiTransferBudget: 5 }));
    expect(f.transferBudget).toBe(5);
    expect(f.seasonalTransferBudget).toBe(seasonalTransferBudgetFor("MEDIUM", 0));
  });
});
