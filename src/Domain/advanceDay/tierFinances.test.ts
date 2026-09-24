import { describe, expect, test } from "bun:test";
import type { Squad } from "@/types/playerTypes";
import { applyTierFinanceChange, tierIncomeRatio } from "@/Domain/advanceDay/tierFinances";

const squad = (fin?: Squad["finances"]): Squad => ({
  id: "s1", name: "S", colors: ["#000", "#fff"], money: 0, players: [], finances: fin,
});
const fin = { broadcasting: 100_000_000, commercial: 50_000_000, total: 150_000_000, budget: 30_000_000, followers: 9 };

describe("tierIncomeRatio", () => {
  test("uses the tier table both ways", () => {
    expect(tierIncomeRatio(1, 2)).toBeCloseTo(0.35);
    expect(tierIncomeRatio(2, 1)).toBeCloseTo(1 / 0.35);
    expect(tierIncomeRatio(2, 3)).toBeCloseTo(0.12 / 0.35);
    expect(tierIncomeRatio(3, 4)).toBeCloseTo(0.05 / 0.12);
    expect(tierIncomeRatio(2, 2)).toBe(1);
  });
  test("tiers below the table reuse the deepest multiplier", () => {
    expect(tierIncomeRatio(4, 5)).toBe(1);
    expect(tierIncomeRatio(5, 3)).toBeCloseTo(0.12 / 0.05);
  });
});

describe("applyTierFinanceChange", () => {
  test("relegation 1 → 2 scales broadcasting and commercial, keeps budget and followers", () => {
    const out = applyTierFinanceChange(squad(fin), 1, 2);
    expect(out.finances).toEqual({ broadcasting: 35_000_000, commercial: 17_500_000, total: 52_500_000, budget: 30_000_000, followers: 9 });
  });
  test("promotion 2 → 1 scales up", () => {
    const out = applyTierFinanceChange(squad({ ...fin, broadcasting: 35_000_000, commercial: 0, total: 35_000_000 }), 2, 1);
    expect(out.finances!.broadcasting).toBe(100_000_000);
    expect(out.finances!.budget).toBe(30_000_000);
  });
  test("pure: input untouched; same tier or no finances returns the same object", () => {
    const s = squad(fin);
    applyTierFinanceChange(s, 1, 3);
    expect(s.finances!.broadcasting).toBe(100_000_000);
    expect(applyTierFinanceChange(s, 2, 2)).toBe(s);
    const bare = squad();
    expect(applyTierFinanceChange(bare, 1, 2)).toBe(bare);
  });
});
