import { describe, expect, test } from "bun:test";
import { computeAdvanceDayMoney } from "@/Domain/advanceDay/financial";
import { squadWeeklyWages, wageFactorOf } from "@/Domain/finance/wages";
import { gateRevenue } from "@/Domain/finance/gate";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

const player = (id: string, overrides: Partial<RosterPlayer["stats"]> = {}): RosterPlayer => ({
  id, name: id, age: 25, positions: ["Midfielder"],
  stats: {
    passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5,
    tackling: 5, pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 0, jump: 0,
    ...overrides,
  },
} as RosterPlayer);

const squad = (overrides: Partial<Squad> = {}): Squad => ({
  id: "c1", name: "Test FC", colors: ["#000", "#fff"], money: 0,
  players: [player("p1"), player("p2")],
  finances: { broadcasting: 10_000_000, commercial: 5_200_000, total: 15_200_000, budget: 1_000_000, followers: 0 },
  venue: { name: "Arena", city: "City", capacity: 40_000, surface: "grass" },
  ...overrides,
});

describe("computeAdvanceDayMoney", () => {
  test("no squad → no entries", () => {
    expect(computeAdvanceDayMoney({ currentDate: "2027-03-08", playerSquad: null, homeFixturesToday: [] })).toEqual([]);
  });

  test("a Monday with no home fixture: commercial + wages + operational, three entries", () => {
    const sq = squad();
    const entries = computeAdvanceDayMoney({ currentDate: "2027-03-08", playerSquad: sq, homeFixturesToday: [] }); // Monday
    expect(entries.map((e) => e.kind)).toEqual(["commercial", "wages", "operational"]);

    const weeklyCommercial = Math.round(5_200_000 / 52);
    const weeklyWages = squadWeeklyWages(sq.players, wageFactorOf(sq));
    expect(entries[0]!.amount).toBe(weeklyCommercial);
    expect(entries[1]!.amount).toBe(-weeklyWages);
    expect(entries[2]!.amount).toBe(-Math.round(weeklyWages * 0.1));
  });

  test("a non-Monday with no home fixture: no entries", () => {
    const entries = computeAdvanceDayMoney({ currentDate: "2027-03-09", playerSquad: squad(), homeFixturesToday: [] }); // Tuesday
    expect(entries).toEqual([]);
  });

  test("a home league fixture on a non-Monday: one gate entry", () => {
    const entries = computeAdvanceDayMoney({
      currentDate: "2027-03-09",
      playerSquad: squad(),
      homeFixturesToday: [{ competition: "premier_league", kind: "league", label: "Premier League" }],
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ kind: "gate", label: "Premier League", ref: { competition: "premier_league" } });
    expect(entries[0]!.amount).toBe(gateRevenue(40_000, "league"));
  });

  test("a home continental fixture pays double the league gate", () => {
    const entries = computeAdvanceDayMoney({
      currentDate: "2027-03-09",
      playerSquad: squad(),
      homeFixturesToday: [{ competition: "ucl", kind: "continental", label: "Champions League" }],
    });
    expect(entries[0]!.amount).toBe(gateRevenue(40_000, "continental"));
    expect(entries[0]!.amount).toBe(gateRevenue(40_000, "league") * 2);
  });

  test("a neutral-venue fixture (a final) contributes no gate entry", () => {
    const entries = computeAdvanceDayMoney({
      currentDate: "2027-03-09",
      playerSquad: squad(),
      homeFixturesToday: [{ competition: "cup_england", kind: "cup", label: "FA Cup", neutral: true }],
    });
    expect(entries).toEqual([]);
  });

  test("a Monday that is also a home fixture day: weekly entries plus the gate entry", () => {
    const entries = computeAdvanceDayMoney({
      currentDate: "2027-03-08", // Monday
      playerSquad: squad(),
      homeFixturesToday: [{ competition: "cup_england", kind: "cup", label: "FA Cup" }],
    });
    expect(entries.map((e) => e.kind)).toEqual(["commercial", "wages", "operational", "gate"]);
  });

  test("two home fixtures on the same day (league + cup, should not normally happen) both post", () => {
    const entries = computeAdvanceDayMoney({
      currentDate: "2027-03-09",
      playerSquad: squad(),
      homeFixturesToday: [
        { competition: "premier_league", kind: "league", label: "Premier League" },
        { competition: "cup_england", kind: "cup", label: "FA Cup" },
      ],
    });
    expect(entries).toHaveLength(2);
  });
});
