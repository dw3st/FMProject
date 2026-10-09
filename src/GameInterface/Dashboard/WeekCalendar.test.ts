import { describe, expect, test } from "bun:test";
import { matchEventLabel, matchOutcomeFor, youthDayEntries } from "@/GameInterface/Dashboard/WeekCalendar";
import type { Fixture } from "@/types/calendarTypes";

function fixture(overrides: Partial<Fixture> = {}): Fixture {
  return {
    id: "fix_0001",
    date: "2027-03-01",
    competition: "cup_england",
    round: 1,
    home: "home_id",
    away: "away_id",
    played: true,
    result: { home: 1, away: 1 },
    ...overrides,
  };
}

describe("matchOutcomeFor", () => {
  test("real draw (no shootout) is D", () => {
    expect(matchOutcomeFor(fixture({ result: { home: 1, away: 1 } }), true)).toBe("D");
    expect(matchOutcomeFor(fixture({ result: { home: 1, away: 1 } }), false)).toBe("D");
  });

  test("regular goal difference decides W/L when there is no shootout", () => {
    const f = fixture({ result: { home: 2, away: 1 } });
    expect(matchOutcomeFor(f, true)).toBe("W");
    expect(matchOutcomeFor(f, false)).toBe("L");
  });

  test("a level scoreline decided on penalties is W for the shootout winner, never D", () => {
    const f = fixture({
      result: { home: 1, away: 1 },
      knockout: true,
      decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 4, away: 3 } },
    });
    expect(matchOutcomeFor(f, true)).toBe("W");
    expect(matchOutcomeFor(f, false)).toBe("L");
  });

  test("shootout loser is L even if they scored more goals in the tie", () => {
    // Not realistic (result reflects 90'+ET), but the shootout must still win the tie-break.
    const f = fixture({
      result: { home: 2, away: 2 },
      knockout: true,
      decider: { extraTime: { home: 1, away: 1 }, penalties: { home: 2, away: 5 } },
    });
    expect(matchOutcomeFor(f, true)).toBe("L");
    expect(matchOutcomeFor(f, false)).toBe("W");
  });
});

describe("matchEventLabel", () => {
  test("unplayed fixture has no outcome", () => {
    const f = fixture({ played: false, result: null });
    expect(matchEventLabel(f, "Rivals", true)).toEqual({ label: "vs Rivals", outcome: null });
  });

  test("penalty shootout win is labelled W, not D, despite a level scoreline", () => {
    const f = fixture({
      result: { home: 1, away: 1 },
      knockout: true,
      decider: { extraTime: { home: 0, away: 0 }, penalties: { home: 5, away: 4 } },
    });
    expect(matchEventLabel(f, "Rivals", true)).toEqual({ label: "W 1–1 vs Rivals", outcome: "W" });
    expect(matchEventLabel(f, "Rivals", false)).toEqual({ label: "L 1–1 @ Rivals", outcome: "L" });
  });
});

describe("youthDayEntries", () => {
  test("the club's youth games of the day, under-19 first, with score and cancellation", () => {
    const list = [
      fixture({ id: "a", competition: "u21_england", home: "me", away: "x", result: { home: 2, away: 1 } }),
      fixture({ id: "b", competition: "u19_england", home: "y", away: "me", played: false, result: null }),
      fixture({ id: "c", competition: "u19_england", home: "y", away: "z" }),
      fixture({ id: "d", competition: "premier_league", home: "me", away: "z" }),
      fixture({ id: "e", date: "2027-03-02", competition: "u21_england", home: "me", away: "z", result: null, cancelled: true }),
    ];
    expect(youthDayEntries(list, "2027-03-01", "me")).toEqual([
      { age: "u19", opponentId: "y", isHome: false, score: null, cancelled: false },
      { age: "u21", opponentId: "x", isHome: true, score: "W 2–1", cancelled: false },
    ]);
    expect(youthDayEntries(list, "2027-03-02", "me")).toEqual([
      { age: "u21", opponentId: "z", isHome: true, score: null, cancelled: true },
    ]);
  });
});
