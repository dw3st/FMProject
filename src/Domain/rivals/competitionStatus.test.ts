import { describe, expect, test } from "bun:test";
import { knockoutComp, leagueComp, tableAround } from "@/Domain/rivals/competitionStatus";
import type { Fixture, LeagueSeasonMeta } from "@/types/calendarTypes";
import type { StandingRow } from "@/types/playerTypes";

const row = (id: string, pts: number, mp = 10): StandingRow =>
  ({ squadId: id, name: id.toUpperCase(), colors: ["#000", "#fff"], mp, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts, form: [] });
const table = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id, i) => row(id, 30 - i));

const fx = (o: Partial<Fixture> & Pick<Fixture, "id" | "round" | "date" | "home" | "away">): Fixture =>
  ({ competition: "x", played: false, result: null, ...o }) as Fixture;

describe("friend's competitions (8.9.9)", () => {
  test("league: position, size and points; nothing before the first game", () => {
    expect(leagueComp("l", table, "c")).toEqual({ slug: "l", kind: "league", position: 3, size: 8, points: 28 });
    expect(leagueComp("l", [row("a", 0, 0)], "a")).toBeNull();
  });

  test("five table rows around him, clamped at the top and the bottom", () => {
    expect(tableAround(table, "a").map((r) => r.position)).toEqual([1, 2, 3, 4, 5]);
    expect(tableAround(table, "e").map((r) => r.position)).toEqual([3, 4, 5, 6, 7]);
    expect(tableAround(table, "h").map((r) => r.position)).toEqual([4, 5, 6, 7, 8]);
  });

  test("cup: alive with the next date, out after a lost tie, champion", () => {
    const meta = { cup: { country: "X", stages: [{ round: 1, name: "qf", date: "2034-03-01", entrants: [], drawn: true }, { round: 2, name: "sf", date: "2034-03-15", entrants: [], drawn: true }], byes: [], tiers: {}, championId: null } } as unknown as LeagueSeasonMeta;
    const won = fx({ id: "1", round: 1, date: "2034-03-01", home: "me", away: "o", played: true, result: { home: 2, away: 0 }, knockout: true });
    const next = fx({ id: "2", round: 2, date: "2034-03-15", home: "me", away: "p", knockout: true });
    expect(knockoutComp("c", meta, [won, next], "me")).toEqual({ slug: "c", kind: "cup", state: "alive", nextDate: "2034-03-15", stage: "sf" });
    const lost = { ...next, played: true, result: { home: 0, away: 1 } };
    expect(knockoutComp("c", meta, [won, lost], "me")).toMatchObject({ state: "out", stage: "sf" });
    const champ = { ...meta, cup: { ...meta.cup!, championId: "me" } } as LeagueSeasonMeta;
    expect(knockoutComp("c", champ, [won, { ...next, played: true, result: { home: 3, away: 1 } }], "me")).toMatchObject({ state: "champion" });
  });

  test("continental: the first leg of a tie still open", () => {
    const meta = {
      continental: {
        competition: "ucl", continent: "Europe", groups: [{ name: "A", clubs: ["me", "o"] }], countryOf: {}, level: {}, championId: null,
        stages: [{ name: "group", rounds: [1], dates: [], drawn: true }, { name: "r16", rounds: [7, 8], dates: [], drawn: true }],
      },
    } as unknown as LeagueSeasonMeta;
    const g = fx({ id: "g", round: 1, date: "2034-01-01", home: "me", away: "o", played: true, result: { home: 1, away: 0 } });
    const l1 = fx({ id: "a", round: 7, date: "2034-02-10", home: "x", away: "me", played: true, result: { home: 1, away: 2 }, knockout: true, tieId: "t", leg: 1 });
    const l2 = fx({ id: "b", round: 8, date: "2034-02-17", home: "me", away: "x", knockout: true, tieId: "t", leg: 2 });
    expect(knockoutComp("ucl", meta, [g, l1, l2], "me")).toEqual({
      slug: "ucl", kind: "continental", state: "alive", nextDate: "2034-02-17", stage: "r16", firstLeg: { for: 2, against: 1 },
    });
    expect(knockoutComp("ucl", meta, [g], "me")).toMatchObject({ stage: "group", group: "A", position: 1 });
  });
});
