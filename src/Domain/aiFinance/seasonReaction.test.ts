import { describe, expect, test } from "bun:test";
import type { ClubFinances, Squad, StandingRow } from "@/types/playerTypes";
import {
  clubSeasonOutcome,
  applyAISeasonReaction,
  applyHumanSeasonReaction,
  followersChange,
  nextFinancialTier,
  seasonPerformance,
  type ClubSeasonOutcome,
} from "@/Domain/aiFinance/seasonReaction";
import { applyTierFinanceChange } from "@/Domain/advanceDay/tierFinances";
import { AI_FINANCE_CONFIG } from "@/Domain/aiFinance/aiFinanceConfig";
import { popularityFromFollowers, seasonalTransferBudgetFor } from "@/Domain/aiFinance/aiClubFinance";

const out = (rank: number, move: ClubSeasonOutcome["move"] = null, leagueSize = 20, played = true): ClubSeasonOutcome =>
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
  test("grants next season's transfer budget from the new tier (no carried balance)", () => {
    const s = applyAISeasonReaction(squad(fin(0, 0, 0), { aiTransferBudget: 0 }), out(10));
    expect(s.aiTransferBudget).toBe(seasonalTransferBudgetFor("LOW", 0));
    expect(s.finances!.budget).toBe(0);
    expect(s.finances!.followers).toBe(AI_FINANCE_CONFIG.season.FOLLOWERS_FLOOR);
    const champ = applyAISeasonReaction(squad(fin(100_000_000, 1_000_000), { aiTransferBudget: 1 }), out(1));
    expect(champ.aiTransferBudget).toBe(seasonalTransferBudgetFor("ELITE", popularityFromFollowers(1_150_000)));
  });
  test("a squad without finances gets a tier and a budget", () => {
    const s = applyAISeasonReaction(squad(undefined), out(10));
    expect(s.financialTier).toBe("LOW");
    expect(s.aiTransferBudget).toBe(seasonalTransferBudgetFor("LOW", 0));
    expect(s.finances).toBeUndefined();
  });
});

describe("applyHumanSeasonReaction", () => {
  test("followers only: no tier, no AI budget, money untouched", () => {
    const s = squad(fin(100_000_000, 1_000_000, 7_000_000));
    const r = applyHumanSeasonReaction(s, out(1));
    expect(r.followersBefore).toBe(1_000_000);
    expect(r.followersAfter).toBe(1_150_000);
    expect(r.squad.finances).toEqual({ ...s.finances!, followers: 1_150_000 });
    expect(r.squad.financialTier).toBeUndefined();
    expect(r.squad.aiTransferBudget).toBeUndefined();
  });
  test("same soft balancing as AI clubs (natural tier of its income)", () => {
    const low = applyHumanSeasonReaction(squad(fin(1_000_000, 1_000_000)), out(1));
    expect(low.followersAfter).toBe(Math.round(1_000_000 * (1 + followersChange(out(1), "LOW"))));
    const rel = applyHumanSeasonReaction(squad(fin(100_000_000, 1_000_000)), out(20, "relegated"));
    expect(rel.followersAfter).toBeLessThan(1_000_000);
  });
  test("no finances: unchanged", () => {
    const r = applyHumanSeasonReaction(squad(undefined), out(1));
    expect(r.followersAfter).toBe(r.followersBefore);
  });
});

describe("clubSeasonOutcome", () => {
  const row = (squadId: string, mp: number): StandingRow => ({
    squadId, name: squadId, colors: ["#000", "#fff"], mp, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [],
  });
  test("rank from the table, move from the plan", () => {
    const table = [row("a", 38), row("b", 38), row("c", 38)];
    expect(clubSeasonOutcome(table, "b", [{ squadId: "b", kind: "relegated" }]))
      .toEqual({ rank: 2, leagueSize: 3, played: true, move: "relegated" });
    expect(clubSeasonOutcome([row("a", 0)], "a", []).played).toBe(false);
  });
  test("continental.good marks the outcome continentalGood, absent otherwise", () => {
    const table = [row("a", 38), row("b", 38), row("c", 38)];
    const good = clubSeasonOutcome(table, "c", [], { good: new Set(["c"]) });
    expect(good.continentalGood).toBe(true);
    const notGood = clubSeasonOutcome(table, "c", [], { good: new Set(["b"]) });
    expect(notGood.continentalGood).toBeUndefined();
    expect(clubSeasonOutcome(table, "c", []).continentalGood).toBeUndefined();
  });
  test("continental.title marks the outcome continentalTitle independently of good", () => {
    const table = [row("a", 38), row("b", 38), row("c", 38)];
    // Champion: in both sets.
    const champion = clubSeasonOutcome(table, "c", [], { good: new Set(["c"]), title: new Set(["c"]) });
    expect(champion.continentalGood).toBe(true);
    expect(champion.continentalTitle).toBe(true);
    // Runner-up: reached the final (good) but didn't win it (no title).
    const runnerUp = clubSeasonOutcome(table, "b", [], { good: new Set(["b", "c"]), title: new Set(["c"]) });
    expect(runnerUp.continentalGood).toBe(true);
    expect(runnerUp.continentalTitle).toBeUndefined();
    // Neither set given: both undefined.
    expect(clubSeasonOutcome(table, "c", []).continentalTitle).toBeUndefined();
  });
});

describe("continental title/final counts as a good season (Task 6, design spec §3 'IA')", () => {
  // A club that finished bottom of the table (a clearly "bad" domestic season) but reached a
  // continental final gets the same treatment as a top-15% finish: +1 tier step, and the same
  // seasonPerformance a club right at the TOP_FRAC cutoff would get.
  const badTable: ClubSeasonOutcome = { rank: 20, leagueSize: 20, played: true, move: null };
  const goodContinental: ClubSeasonOutcome = { ...badTable, continentalGood: true };

  test("seasonPerformance floors the fraction at TOP_FRAC instead of the real (bad) finish", () => {
    expect(seasonPerformance(badTable)).toBeLessThan(0);
    const s = AI_FINANCE_CONFIG.season;
    expect(seasonPerformance(goodContinental)).toBeCloseTo(1 - 2 * s.TOP_FRAC);
  });

  test("nextFinancialTier steps up (same weight as a top-15% finish), never down", () => {
    expect(nextFinancialTier("MEDIUM", "MEDIUM", badTable)).toBe("LOW");
    expect(nextFinancialTier("MEDIUM", "MEDIUM", goodContinental)).toBe("HIGH");
  });

  test("followersChange matches a finish exactly at the TOP_FRAC cutoff, beats the real (bad) finish", () => {
    // rank 4 of 21: (4-1)/(21-1) = 0.15 = TOP_FRAC exactly.
    const atCutoff: ClubSeasonOutcome = { rank: 4, leagueSize: 21, played: true, move: null };
    expect(followersChange(goodContinental, "HIGH")).toBeCloseTo(followersChange(atCutoff, "HIGH"));
    expect(followersChange(goodContinental, "HIGH")).toBeGreaterThan(followersChange(badTable, "HIGH"));
  });

  test("does not override promotion/relegation, and never worsens an already-good finish", () => {
    expect(nextFinancialTier("MEDIUM", "MEDIUM", { ...badTable, move: "relegated", continentalGood: true })).toBe("LOW");
    const champion: ClubSeasonOutcome = { rank: 1, leagueSize: 20, played: true, move: null, continentalGood: true };
    expect(seasonPerformance(champion)).toBe(seasonPerformance({ ...champion, continentalGood: false }));
  });
});

describe("continentalTitle unlocks ELITE like a domestic title (Task 6 review fix)", () => {
  // A finalist (continentalGood, no title) still can't jump into ELITE without a domestic
  // title — only actually WINNING a continental competition (continentalTitle) does, same as
  // being domestic champion (`o.rank === 1`).
  test("a continental finalist (good, no title) is capped one step below ELITE, same as any other top finish", () => {
    const finalist: ClubSeasonOutcome = { rank: 20, leagueSize: 20, played: true, move: null, continentalGood: true };
    expect(nextFinancialTier("HIGH", "HIGH", finalist)).toBe("HIGH"); // capped: would be ELITE, but no title
  });

  test("a continental champion (title) unlocks ELITE even with a poor domestic finish", () => {
    const champion: ClubSeasonOutcome = {
      rank: 20, leagueSize: 20, played: true, move: null, continentalGood: true, continentalTitle: true,
    };
    expect(nextFinancialTier("HIGH", "HIGH", champion)).toBe("ELITE");
  });

  test("continentalTitle bypasses the domestic-title requirement regardless of where the step up came from (e.g. promotion)", () => {
    const promotedAndChampion: ClubSeasonOutcome = { rank: 2, leagueSize: 20, played: true, move: "promoted", continentalTitle: true };
    expect(nextFinancialTier("HIGH", "HIGH", promotedAndChampion)).toBe("ELITE");
    // Without the title, the same promotion is capped one step below ELITE.
    expect(nextFinancialTier("HIGH", "HIGH", { ...promotedAndChampion, continentalTitle: undefined })).toBe("HIGH");
  });

  test("a domestic title still unlocks ELITE on its own (unchanged behaviour)", () => {
    const domesticChampion: ClubSeasonOutcome = { rank: 1, leagueSize: 20, played: true, move: null };
    expect(nextFinancialTier("HIGH", "HIGH", domesticChampion)).toBe("ELITE");
  });
});
