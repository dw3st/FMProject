import { describe, expect, test } from "bun:test";
import { initialYouthRound, youthLeaderboards } from "@/GameInterface/Components/YouthCompView";
import { applyCallUpDuration, callUpLeftLabel, toggleCallUp } from "@/GameInterface/Squad/YouthCallUpsPanel";
import { newCallUp } from "@/Domain/youthComps/callUps";
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

  test("call-up toggle never passes the cap and adds with the chosen duration", () => {
    const a = newCallUp("a", "next");
    expect(toggleCallUp([a], "a", "games3")).toEqual([]);
    expect(toggleCallUp([a], "b", "games3", 2)).toEqual([a, { id: "b", duration: "games3", left: 3 }]);
    expect(toggleCallUp([a, newCallUp("b", "next")], "c", "next", 2).map((c) => c.id)).toEqual(["a", "b"]);
  });

  test("apply a duration to every call-up: the same duration keeps its progress", () => {
    const list = [{ id: "a", duration: "games3" as const, left: 1 }, newCallUp("b", "next")];
    expect(applyCallUpDuration(list, "games3")).toEqual([{ id: "a", duration: "games3", left: 1 }, { id: "b", duration: "games3", left: 3 }]);
  });

  test("what is left of each call-up", () => {
    const t = (key: string, o?: Record<string, unknown>) => (o ? `${key}:${JSON.stringify(o)}` : key);
    expect(callUpLeftLabel({ id: "a", duration: "games5", left: 4 }, t)).toBe("4");
    expect(callUpLeftLabel(newCallUp("a", "next"), t)).toBe("1");
    expect(callUpLeftLabel(newCallUp("a", "indefinite"), t)).toBe("∞");
    expect(callUpLeftLabel({ id: "a", duration: "rhythm", streak: 1 }, t)).toBe('youthComps.callUps.rhythmLeft:{"n":1,"of":3}');
  });
});
