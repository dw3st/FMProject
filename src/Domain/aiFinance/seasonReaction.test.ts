import { describe, expect, test } from "bun:test";
import type { ClubFinances, Squad, StandingRow } from "@/types/playerTypes";
import {
  aiSeasonOutcome,
  applyAISeasonReaction,
  followersChange,
  nextFinancialTier,
  seasonPerformance,
  type AISeasonOutcome,
} from "@/Domain/aiFinance/seasonReaction";
import { applyTierFinanceChange } from "@/Domain/advanceDay/tierFinances";
import { AI_FINANCE_CONFIG } from "@/Domain/aiFinance/aiFinanceConfig";

const out = (rank: number, move: AISeasonOutcome["move"] = null, leagueSize = 20, played = true): AISeasonOutcome =>
  ({ rank, leagueSize, played, move });

const fin = (income: number, followers = 1_000_000, budget = 50_000_000): ClubFinances => ({
  broadcasting: income, commercial: 0, total: income, budget, followers,
});
const squad = (finances?: ClubFinances, extra: Partial<Squad> = {}): Squad => ({
  id: "s", name: "S", colors: ["#000", "#fff"], money: 0, players: [], finances, ...extra,
});

describe("seasonPerformance", () => {
  test("+1 champion, 0 mid-table, -1 last, 0 when unplayed", () => {
    expect(seasonPerformance(out(1))).toBe(1);
    expect(seasonPerformance(out(20))).toBe(-1);
    expect(seasonPerformance(out(3, null, 5))).toBe(0);
    expect(seasonPerformance(out(1, null, 20, false))).toBe(0);
  });
});

describe("followersChange", () => {
  test("good season up, bad season slightly down", () => {
    const g = followersChange(out(2), "HIGH");
    const b = followersChange(out(19), "HIGH");
    expect(g).toBeGreaterThan(0);
    expect(b).toBeLessThan(0);
    expect(Math.abs(b)).toBeLessThan(g);
  });
  test("champion bonus and promotion/relegation", () => {
    expect(followersChange(out(1), "HIGH")).toBeCloseTo(0.1 + 0.05);
    expect(followersChange(out(1, "promoted"), "HIGH")).toBeCloseTo(0.25);
    expect(followersChange(out(20, "relegated"), "HIGH")).toBeCloseTo(-0.1);
  });
  test("soft balancing: weak gain more, strong lose more", () => {
    expect(followersChange(out(1), "LOW")).toBeGreaterThan(followersChange(out(1), "ELITE"));
    expect(followersChange(out(20), "ELITE")).toBeLessThan(followersChange(out(20), "LOW"));
  });
});

describe("nextFinancialTier", () => {
  test("promotion / relegation move one step", () => {
    expect(nextFinancialTier("MEDIUM", "MEDIUM", out(2, "promoted"))).toBe("HIGH");
    expect(nextFinancialTier("HIGH", "HIGH", out(19, "relegated"))).toBe("MEDIUM");
  });
  test("top finish up, bottom finish down, mid-table stays", () => {
    expect(nextFinancialTier("MEDIUM", "MEDIUM", out(2))).toBe("HIGH");
    expect(nextFinancialTier("MEDIUM", "MEDIUM", out(19))).toBe("LOW");
    expect(nextFinancialTier("MEDIUM", "MEDIUM", out(10))).toBe("MEDIUM");
    expect(nextFinancialTier("MEDIUM", "MEDIUM", out(1, null, 20, false))).toBe("MEDIUM");
  });
  test("ELITE only through a title", () => {
    expect(nextFinancialTier("HIGH", "HIGH", out(2))).toBe("HIGH");
    expect(nextFinancialTier("HIGH", "HIGH", out(1))).toBe("ELITE");
  });
  test("bounded: stays within one step of the natural tier, and within the scale", () => {
    expect(nextFinancialTier("HIGH", "MEDIUM", out(1))).toBe("HIGH");
    expect(nextFinancialTier("LOW", "HIGH", out(10))).toBe("MEDIUM");
    expect(nextFinancialTier("ELITE", "ELITE", out(1))).toBe("ELITE");
    expect(nextFinancialTier("LOW", "LOW", out(20))).toBe("LOW");
  });
});

describe("applyAISeasonReaction", () => {
  test("stores tier, grows followers after a title", () => {
    const s = applyAISeasonReaction(squad(fin(100_000_000, 1_000_000)), out(1));
    expect(s.financialTier).toBe("ELITE");
    expect(s.finances!.followers).toBe(1_150_000);
  });
  test("relegated club (after the income cut) drops tier and followers", () => {
    const pl = squad(fin(150_000_000, 10_000_000), { financialTier: "HIGH" });
    const cut = applyTierFinanceChange(pl, 1, 2); // income ×0.35 → natural MEDIUM
    const s = applyAISeasonReaction(cut, out(19, "relegated"));
    expect(s.financialTier).toBe("MEDIUM");
    expect(s.finances!.followers).toBeLessThan(10_000_000);
  });
  test("never bankrupt: budget floored per tier, followers floored", () => {
    const s = applyAISeasonReaction(squad(fin(0, 0, 0)), out(10));
    expect(s.finances!.budget).toBe(AI_FINANCE_CONFIG.season.MIN_BUDGET.LOW);
    expect(s.finances!.followers).toBe(AI_FINANCE_CONFIG.season.FOLLOWERS_FLOOR);
  });
  test("a squad without finances only gets a tier", () => {
    const s = applyAISeasonReaction(squad(undefined), out(10));
    expect(s.financialTier).toBe("LOW");
    expect(s.finances).toBeUndefined();
  });
});

describe("aiSeasonOutcome", () => {
  const row = (squadId: string, mp: number): StandingRow => ({
    squadId, name: squadId, colors: ["#000", "#fff"], mp, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [],
  });
  test("rank from the table, move from the plan", () => {
    const table = [row("a", 38), row("b", 38), row("c", 38)];
    expect(aiSeasonOutcome(table, "b", [{ squadId: "b", kind: "relegated" }]))
      .toEqual({ rank: 2, leagueSize: 3, played: true, move: "relegated" });
    expect(aiSeasonOutcome([row("a", 0)], "a", []).played).toBe(false);
  });
});
