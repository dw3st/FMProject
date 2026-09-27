import { describe, expect, test } from "bun:test";
import { aiBudgetWithPrize, continentalPrize, cupRunnerUpPrize, cupStagePrize, leaguePrize } from "@/Domain/finance/prizes";

describe("leaguePrize", () => {
  test("champion (position 1) gets merit + champion bonus", () => {
    // n=20, position 1: merit = 100M * 0.20 * (19/19) = 20M; title = 100M * 0.05 = 5M
    expect(leaguePrize(100e6, 1, 20)).toBe(25_000_000);
  });

  test("last place gets 0 (no merit spread, no title)", () => {
    expect(leaguePrize(100e6, 20, 20)).toBe(0);
  });

  test("middle of the table gets a partial merit share, no title", () => {
    // n=20, position 10: merit = 100M * 0.20 * (10/19) ≈ 10,526,315.79 -> rounds to 10,526,316
    expect(leaguePrize(100e6, 10, 20)).toBe(10_526_316);
  });

  test("n < 2 always pays 0 (no spread possible)", () => {
    expect(leaguePrize(100e6, 1, 1)).toBe(0);
    expect(leaguePrize(100e6, 1, 0)).toBe(0);
  });
});

describe("cupStagePrize / cupRunnerUpPrize", () => {
  const base = 50e6;

  test("early stages pay the smallest share", () => {
    expect(cupStagePrize(base, "preliminary")).toBe(150_000);
    expect(cupStagePrize(base, "r128")).toBe(150_000);
    expect(cupStagePrize(base, "r64")).toBe(150_000);
  });

  test("stage shares increase toward the final", () => {
    expect(cupStagePrize(base, "r32")).toBe(250_000);
    expect(cupStagePrize(base, "r16")).toBe(400_000);
    expect(cupStagePrize(base, "qf")).toBe(550_000);
    expect(cupStagePrize(base, "sf")).toBe(750_000);
  });

  test("champion gets only the final value, not runner-up + champion", () => {
    const championPrize = cupStagePrize(base, "final");
    expect(championPrize).toBe(2_000_000); // 50M * 0.04
    // Explicitly not the sum of runner-up + champion shares.
    expect(championPrize).not.toBe(cupRunnerUpPrize(base) + championPrize);
  });

  test("runner-up gets the runner-up value", () => {
    expect(cupRunnerUpPrize(base)).toBe(1_000_000); // 50M * 0.02
  });
});

describe("continentalPrize", () => {
  test("ucl values per event kind", () => {
    expect(continentalPrize("ucl", "participation")).toBe(15e6);
    expect(continentalPrize("ucl", "groupWin")).toBe(2.8e6);
    expect(continentalPrize("ucl", "groupDraw")).toBe(0.9e6);
    expect(continentalPrize("ucl", "r16")).toBe(9e6);
    expect(continentalPrize("ucl", "qf")).toBe(10e6);
    expect(continentalPrize("ucl", "sf")).toBe(12e6);
    expect(continentalPrize("ucl", "final")).toBe(15e6);
    expect(continentalPrize("ucl", "title")).toBe(4e6);
  });

  test("uel values per event kind", () => {
    expect(continentalPrize("uel", "participation")).toBe(4e6);
    expect(continentalPrize("uel", "groupWin")).toBe(0.6e6);
    expect(continentalPrize("uel", "groupDraw")).toBe(0.2e6);
    expect(continentalPrize("uel", "r16")).toBe(1.2e6);
    expect(continentalPrize("uel", "qf")).toBe(1.8e6);
    expect(continentalPrize("uel", "sf")).toBe(2.8e6);
    expect(continentalPrize("uel", "final")).toBe(4.5e6);
    expect(continentalPrize("uel", "title")).toBe(4e6);
  });

  test("lib values per event kind", () => {
    expect(continentalPrize("lib", "participation")).toBe(3e6);
    expect(continentalPrize("lib", "groupWin")).toBe(0.3e6);
    expect(continentalPrize("lib", "groupDraw")).toBe(0.1e6);
    expect(continentalPrize("lib", "r16")).toBe(1.2e6);
    expect(continentalPrize("lib", "qf")).toBe(1.7e6);
    expect(continentalPrize("lib", "sf")).toBe(2.3e6);
    expect(continentalPrize("lib", "final")).toBe(5e6);
    expect(continentalPrize("lib", "title")).toBe(17e6);
  });

  test("sud values per event kind", () => {
    expect(continentalPrize("sud", "participation")).toBe(1e6);
    expect(continentalPrize("sud", "groupWin")).toBe(0.1e6);
    expect(continentalPrize("sud", "groupDraw")).toBe(0.05e6);
    expect(continentalPrize("sud", "r16")).toBe(0.5e6);
    expect(continentalPrize("sud", "qf")).toBe(0.6e6);
    expect(continentalPrize("sud", "sf")).toBe(0.8e6);
    expect(continentalPrize("sud", "final")).toBe(1.5e6);
    expect(continentalPrize("sud", "title")).toBe(5e6);
  });
});

describe("aiBudgetWithPrize", () => {
  test("adds 50% of the prize to the current budget", () => {
    expect(aiBudgetWithPrize(1_000_000, 2_000_000, 10_000_000)).toBe(2_000_000);
  });

  test("never lifts the budget above 1.5x the seasonal grant", () => {
    // current 14M + 50% of 10M (5M) = 19M, but cap is 1.5 * 10M = 15M
    expect(aiBudgetWithPrize(14_000_000, 10_000_000, 10_000_000)).toBe(15_000_000);
  });

  test("never lowers a budget already at or above the cap", () => {
    const seasonalGrant = 10_000_000;
    const cap = 1.5 * seasonalGrant;
    expect(aiBudgetWithPrize(cap, 5_000_000, seasonalGrant)).toBe(cap);
    expect(aiBudgetWithPrize(cap + 1_000_000, 5_000_000, seasonalGrant)).toBe(cap + 1_000_000);
  });

  test("rounds the added share", () => {
    // 50% of 1 = 0.5 -> rounds to 1 (banker's/half-up via Math.round)
    expect(aiBudgetWithPrize(0, 1, 1_000_000)).toBe(1);
  });
});
