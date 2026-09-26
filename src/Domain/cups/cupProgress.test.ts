import { describe, expect, test } from "bun:test";
import { generateCup } from "@/Domain/cups/generateCup";
import { cupChampion, drawNextStage, fixtureWinner, stageComplete } from "@/Domain/cups/cupProgress";
import type { Fixture, LeagueCalendarResult } from "@/types/calendarTypes";

const clubs = Array.from({ length: 6 }, (_, i) => ({ id: `c${i}`, tier: i < 2 ? 1 : 2 }));
const base = () => generateCup({
  country: "Testland", year: 2026, clubs,
  window: { start: "2026-08-15", end: "2027-05-20" }, busyDates: new Set(), seedKey: "k",
})!;

const playAll = (fx: Fixture[]): Fixture[] =>
  fx.map((f) => ({ ...f, played: true, result: { home: 1, away: 0 } }));

describe("fixtureWinner", () => {
  const f: Fixture = { id: "x", date: "d", competition: "cup_t", round: 1, home: "h", away: "a", played: true, result: { home: 1, away: 1 }, knockout: true };
  test("score", () => expect(fixtureWinner({ ...f, result: { home: 0, away: 2 } })).toBe("a"));
  test("penalties decide a level score", () =>
    expect(fixtureWinner({ ...f, decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 3, away: 4 } } })).toBe("a"));
  test("unplayed → null", () => expect(fixtureWinner({ ...f, played: false, result: null })).toBeNull());
});

describe("cup progress", () => {
  test("6 clubs: preliminary (4) → sf (2 winners + 2 byes) → final (neutral) → champion", () => {
    let cup: LeagueCalendarResult = base();
    expect(cup.meta.cup!.stages.map((s) => s.name)).toEqual(["preliminary", "sf", "final"]);
    let fixtures = playAll(cup.rounds[0]!.fixtures);
    expect(stageComplete(fixtures)).toBe(true);

    const sf = drawNextStage(cup.meta, 1, fixtures, "k")!;
    expect(sf.round.fixtures).toHaveLength(2);
    expect(sf.meta.cup!.stages[1]!.drawn).toBe(true);
    expect(sf.meta.cup!.stages[1]!.entrants).toHaveLength(4);
    for (const bye of cup.meta.cup!.byes) expect(sf.meta.cup!.stages[1]!.entrants).toContain(bye);

    fixtures = playAll(sf.round.fixtures);
    const fin = drawNextStage(sf.meta, 2, fixtures, "k")!;
    expect(fin.round.fixtures).toHaveLength(1);
    expect(fin.round.fixtures[0]!.neutral).toBe(true);

    const finalPlayed = playAll(fin.round.fixtures);
    expect(drawNextStage(fin.meta, 3, finalPlayed, "k")).toBeNull();
    expect(cupChampion(fin.meta, finalPlayed)).toBe(finalPlayed[0]!.home);
  });

  test("incomplete stage → no draw", () => {
    const cup = base();
    expect(stageComplete(cup.rounds[0]!.fixtures)).toBe(false);
    expect(drawNextStage(cup.meta, 1, cup.rounds[0]!.fixtures, "k")).toBeNull();
  });
});
