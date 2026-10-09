import { describe, expect, test } from "bun:test";
import { initialYouthRound, youthLeaderboards } from "@/GameInterface/Components/YouthCompView";
import { toggleCallUp } from "@/GameInterface/Squad/YouthCallUpsPanel";
import type { Fixture } from "@/types/calendarTypes";

const f = (round: number, played: boolean): Fixture => ({
  id: `f${round}`, date: "2027-03-01", competition: "u21_england", round, home: "a", away: "b",
  played, result: played ? { home: 1, away: 0 } : null,
});

describe("youth competition view helpers", () => {
  test("opens on the last round with a result", () => {
    expect(initialYouthRound([f(1, true), f(2, true), f(3, false)])).toBe(2);
    expect(initialYouthRound([f(1, false)])).toBe(1);
  });

  test("leaderboards: scorers by goals, ratings with the minimum of games", () => {
    const { scorers, ratings } = youthLeaderboards({
      p1: { name: "A", squadId: "a", apps: 4, goals: 3, assists: 0, ratingSum: 28 },
      p2: { name: "B", squadId: "b", apps: 2, goals: 3, assists: 0, ratingSum: 18 },
      p3: { name: "C", squadId: "b", apps: 5, goals: 0, assists: 1, ratingSum: 30, generated: true },
    });
    expect(scorers.map((r) => r.id)).toEqual(["p2", "p1"]);
    expect(ratings.map((r) => r.id)).toEqual(["p1", "p3"]);
  });

  test("call-up toggle never passes the cap", () => {
    expect(toggleCallUp(["a"], "a")).toEqual([]);
    expect(toggleCallUp(["a"], "b", 2)).toEqual(["a", "b"]);
    expect(toggleCallUp(["a", "b"], "c", 2)).toEqual(["a", "b"]);
  });
});
