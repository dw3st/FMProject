// src/Domain/multiplayer/standings.test.ts
import { describe, expect, test } from "bun:test";
import { objectiveItems, withExtra, passageItems, closePassage, rankEntries, sumItems } from "@/Domain/multiplayer/standings";
import type { SeatStanding } from "@/types/standingsTypes";

const open = (over: Partial<SeatStanding> = {}): SeatStanding => ({
  from: "2026-08-15", clubId: "c", clubName: "C", leagueSlug: "premier_league", season: "2026-27", target: 14, extras: [], ...over,
});

describe("standings", () => {
  test("objective: met + positions above, capped at 10", () => {
    expect(objectiveItems(8, 14)).toEqual([{ key: "objective_met", points: 10 }, { key: "above_target", points: 6 }]);
    expect(sumItems(objectiveItems(1, 20))).toBe(10 + 10);
  });
  test("objective: missed, positions below capped at -10", () => {
    expect(objectiveItems(2, 1)).toEqual([{ key: "below_target", points: -1 }]);
    expect(sumItems(objectiveItems(20, 4))).toBe(-10);
  });
  test("no games or no target: nothing", () => {
    expect(objectiveItems(null, 14)).toEqual([]);
    expect(objectiveItems(5, null)).toEqual([]);
  });
  test("extras keep the highest per key for cup/continental, sum the others", () => {
    let s = open();
    s = withExtra(s, { key: "continental", points: 1 });
    s = withExtra(s, { key: "continental", points: 3 });
    s = withExtra(s, { key: "continental", points: 1 });
    s = withExtra(s, { key: "national_objective", points: 2 });
    s = withExtra(s, { key: "national_objective", points: 2 });
    expect(s.extras).toEqual([{ key: "continental", points: 3 }, { key: "national_objective", points: 4 }]);
  });
  test("rollover close: objective, title, promotion and extras, full value", () => {
    const s = withExtra(open({ target: 4 }), { key: "cup", points: 8 });
    const row = closePassage(s, { seatId: "a", closedOn: "2027-05-20", reason: "rollover", position: 1, leagueTitle: true, move: "promoted" });
    expect(row.items.map((i) => i.key)).toEqual(["objective_met", "above_target", "league_title", "promoted", "cup"]);
    expect(row.total).toBe(10 + 3 + 15 + 8 + 8);
    expect(row.id).toBe("a:c:2026-27:2027-05-20");
  });
  test("club change: objective part halved (toward zero), extras whole", () => {
    const s = withExtra(open({ target: 14 }), { key: "continental", points: 1 });
    const row = closePassage(s, { seatId: "a", closedOn: "2026-12-01", reason: "club_change", position: 9 });
    // objective 10 + above 5 = 15 → half 7 (−8)
    expect(row.items).toEqual([
      { key: "objective_met", points: 10 }, { key: "above_target", points: 5 }, { key: "half", points: -8 }, { key: "continental", points: 1 },
    ]);
    expect(row.total).toBe(8);
  });
  test("sacked: halved and -5; negative objective halves toward zero", () => {
    const row = closePassage(open({ target: 4 }), { seatId: "a", closedOn: "2026-12-01", reason: "sacked", position: 13 });
    // below 9 → -9, half → -4 (+5), sacked -5 → total -9
    expect(row.items).toEqual([{ key: "below_target", points: -9 }, { key: "half", points: 5 }, { key: "sacked", points: -5 }]);
    expect(row.total).toBe(-9);
  });
  test("contract end: halved without -5", () => {
    const row = closePassage(open({ target: 4 }), { seatId: "a", closedOn: "2027-05-20", reason: "contract", position: 4 });
    expect(row.items.map((i) => i.key)).toEqual(["objective_met", "half"]);
    expect(row.total).toBe(5);
  });
  test("partial = the same items with today's position, nothing halved", () => {
    const s = withExtra(open({ target: 10 }), { key: "best_manager", points: 4 });
    expect(passageItems(s, { position: 7 })).toEqual([
      { key: "objective_met", points: 10 }, { key: "above_target", points: 3 }, { key: "best_manager", points: 4 },
    ]);
  });
  test("ranking: total, then partial, then name", () => {
    const e = (seatId: string, total: number, partial: number, managerName: string) => ({ seatId, total, managerName, partial: { total: partial } });
    expect(rankEntries([e("a", 10, 1, "Zé"), e("b", 10, 5, "Ana"), e("c", 12, 0, "Bia"), e("d", 10, 1, "Ana")]).map((x) => x.seatId))
      .toEqual(["c", "b", "d", "a"]);
  });
});
