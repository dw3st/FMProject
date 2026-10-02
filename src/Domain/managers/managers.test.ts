import { describe, expect, test } from "bun:test";
import {
  addSeason, awardTitle, buildInitialManagers, continentalPoints, countryWeight, cupPoints,
  leaguePoints, managerOfSquad, promotionPoints, rankManagers,
} from "@/Domain/managers/managers";
import { MANAGERS } from "@/Domain/managers/managerConfig";
import type { ManagerRecord } from "@/types/managerTypes";
import type { Squad } from "@/types/playerTypes";

const rec = (id: string, over: Partial<ManagerRecord> = {}): ManagerRecord => ({
  id, name: id, squadId: `s_${id}`, isPlayer: false, points: 0, seasons: 0, titles: [], ...over,
});

describe("points", () => {
  test("country weight: ratio to the big-5 level, clamped", () => {
    expect(countryWeight(5, 5)).toBe(1);
    expect(countryWeight(4, 5)).toBeCloseTo(0.8);
    expect(countryWeight(9, 5)).toBe(MANAGERS.WEIGHT_MAX);
    expect(countryWeight(0.1, 5)).toBe(MANAGERS.WEIGHT_MIN);
    expect(countryWeight(4, 0)).toBe(MANAGERS.WEIGHT_MIN);
  });

  test("league: tier 1 vs lower, scaled by weight and rounded", () => {
    expect(leaguePoints(1, 1)).toBe(100);
    expect(leaguePoints(2, 1)).toBe(40);
    expect(leaguePoints(3, 0.5)).toBe(20);
    expect(leaguePoints(1, 0.837)).toBe(84);
  });

  test("cup, continental and promotion", () => {
    expect(cupPoints(1)).toBe(50);
    expect(cupPoints(0.5)).toBe(25);
    expect(continentalPoints("ucl")).toBe(150);
    expect(continentalPoints("lib")).toBe(150);
    expect(continentalPoints("uel")).toBe(80);
    expect(continentalPoints("sud")).toBe(80);
    expect(promotionPoints()).toBe(20);
  });
});

describe("records", () => {
  test("award adds points and a title to the club's manager; a repeat is ignored", () => {
    const list = [rec("a"), rec("b")];
    const title = { season: "2026-27", kind: "league" as const, competition: "premier_league", squadId: "s_a", points: 100 };
    const once = awardTitle(list, title);
    expect(once.find((m) => m.id === "a")!.points).toBe(100);
    expect(once.find((m) => m.id === "a")!.titles).toEqual([title]);
    expect(once.find((m) => m.id === "b")).toBe(list[1]);
    expect(awardTitle(once, title)).toBe(once);
    expect(awardTitle(list, { ...title, squadId: "nobody" })).toBe(list);
  });

  test("addSeason counts once per season label", () => {
    const list = [rec("a"), rec("b")];
    const one = addSeason(list, "s_a", "2026-27");
    expect(one[0]!.seasons).toBe(1);
    expect(addSeason(one, "s_a", "2026-27")).toBe(one);
    expect(addSeason(one, "s_a", "2027-28")[0]!.seasons).toBe(2);
  });

  test("rank: points desc, then titles, then name", () => {
    const t = { season: "x", kind: "cup" as const, competition: "c", squadId: "s", points: 10 };
    const ranked = rankManagers([
      rec("zed", { points: 50 }),
      rec("bob", { points: 100 }),
      rec("amy", { points: 50, titles: [t] }),
      rec("Carl", { points: 50 }),
    ]);
    expect(ranked.map((m) => m.id)).toEqual(["bob", "amy", "Carl", "zed"]);
  });

  test("initial managers: one per club, the player's replaces his club's coach", () => {
    const squads = [
      { id: "1", name: "Alpha", coach: { id: 7, name: "Coach Seven" } },
      { id: "2", name: "Beta" },
      { id: "3", name: "Gamma", coach: { id: 9, name: "Old Coach" } },
    ] as unknown as Squad[];
    const out = buildInitialManagers(squads, { squadId: "3", name: "Me" });
    expect(out).toHaveLength(3);
    expect(out.find((m) => m.squadId === "1")).toMatchObject({ id: "coach_7", name: "Coach Seven", isPlayer: false, points: 0 });
    expect(out.find((m) => m.squadId === "2")).toMatchObject({ id: "coach_2", name: "Técnico do Beta" });
    expect(out.find((m) => m.squadId === "3")).toMatchObject({ id: "player", name: "Me", isPlayer: true });
    expect(managerOfSquad(out, "3")!.isPlayer).toBe(true);
  });

  test("coach ids shared by two clubs stay unique", () => {
    const squads = [
      { id: "1", name: "A", coach: { id: 5, name: "X" } },
      { id: "2", name: "B", coach: { id: 5, name: "Y" } },
    ] as unknown as Squad[];
    const ids = buildInitialManagers(squads, null).map((m) => m.id);
    expect(new Set(ids).size).toBe(2);
  });
});
