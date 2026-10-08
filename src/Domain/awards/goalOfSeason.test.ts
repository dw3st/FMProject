import { describe, expect, test } from "bun:test";
import { appendGoals, goalCandidatesOfMatch, goalGeometry, goalWeight, isGoalCandidate, pickGoalOfSeason, sanitizeRecordedGoals } from "@/Domain/awards/goalOfSeason";

describe("goal geometry", () => {
  test("inside the box vs outside, distance to the goal centre", () => {
    expect(goalGeometry({ fromX: 105, fromY: 37, goalX: 115 })).toEqual({ distance: 10, outsideBox: false });
    expect(goalGeometry({ fromX: 88, fromY: 37, goalX: 115 })).toEqual({ distance: 27, outsideBox: true });
    expect(goalGeometry({ fromX: 10, fromY: 37, goalX: 0 }).outsideBox).toBe(false);
    expect(goalGeometry({ fromX: 110, fromY: 10, goalX: 115 }).outsideBox).toBe(true); // wide of the box
  });
});

describe("sanitizeRecordedGoals", () => {
  const home = { id: "h", players: [{ id: "a" }] } as never;
  const away = { id: "w", players: [{ id: "b" }] } as never;
  const g = (playerId: string, team: "home" | "away") => ({ playerId, team, minute: 10, header: false, distance: 20, outsideBox: true });
  test("kept when it matches the score", () => {
    expect(sanitizeRecordedGoals([g("a", "home")], { home: 1, away: 0 }, home, away)).toHaveLength(1);
    expect(sanitizeRecordedGoals([g("a", "home"), g("b", "away")], { home: 1, away: 1 }, home, away)).toHaveLength(2);
    expect(sanitizeRecordedGoals([], { home: 0, away: 0 }, home, away)).toEqual([]);
  });
  test("dropped on a count mismatch, a stranger or a bad number", () => {
    expect(sanitizeRecordedGoals([g("a", "home")], { home: 2, away: 0 }, home, away)).toBeUndefined();
    expect(sanitizeRecordedGoals([g("z", "home")], { home: 1, away: 0 }, home, away)).toBeUndefined();
    expect(sanitizeRecordedGoals([g("b", "home")], { home: 1, away: 0 }, home, away)).toBeUndefined(); // wrong side
    expect(sanitizeRecordedGoals([{ ...g("a", "home"), minute: 999 }], { home: 1, away: 0 }, home, away)).toBeUndefined();
    expect(sanitizeRecordedGoals([{ ...g("a", "home"), minute: 1.5 }], { home: 1, away: 0 }, home, away)).toBeUndefined();
    expect(sanitizeRecordedGoals([{ ...g("a", "home"), distance: -1 }], { home: 1, away: 0 }, home, away)).toBeUndefined();
    expect(sanitizeRecordedGoals([{ ...g("a", "home"), setPiece: "throw_in" }], { home: 1, away: 0 }, home, away)).toBeUndefined();
    expect(sanitizeRecordedGoals([{ ...g("a", "home"), header: "yes" }], { home: 1, away: 0 }, home, away)).toBeUndefined();
    expect(sanitizeRecordedGoals("x" as never, { home: 0, away: 0 }, home, away)).toBeUndefined();
    expect(sanitizeRecordedGoals(undefined, { home: 0, away: 0 }, home, away)).toBeUndefined();
  });
  test("keeps only the known fields", () => {
    const out = sanitizeRecordedGoals([{ ...g("a", "home"), extra: 1, assistId: "a", setPiece: "corner" }], { home: 1, away: 0 }, home, away);
    expect(out).toEqual([{ playerId: "a", team: "home", minute: 10, header: false, distance: 20, outsideBox: true, assistId: "a", setPiece: "corner" }]);
  });
});

describe("goal of the season", () => {
  test("candidates: header or outside the box, never a penalty", () => {
    expect(isGoalCandidate({ header: true, outsideBox: false })).toBe(true);
    expect(isGoalCandidate({ header: false, outsideBox: true })).toBe(true);
    expect(isGoalCandidate({ header: false, outsideBox: true, setPiece: "penalty" })).toBe(false);
    expect(isGoalCandidate({ header: false, outsideBox: false })).toBe(false);
  });
  test("pick is deterministic per save/league/season and independent of the order; none without candidates", () => {
    const goals = [1, 2, 3, 4].map((i) => ({ key: `k${i}`, distance: 20 + i, header: false } as never));
    const a = pickGoalOfSeason(goals, "s1:pl:2026-27");
    expect(a).toBeDefined();
    expect(pickGoalOfSeason(goals, "s1:pl:2026-27")).toEqual(a);
    expect(pickGoalOfSeason([...goals].reverse(), "s1:pl:2026-27")).toEqual(a);
    expect(pickGoalOfSeason([], "x")).toBeUndefined();
    const picks = new Set(Array.from({ length: 40 }, (_, i) => (pickGoalOfSeason(goals, `s${i}:pl:2026-27`) as { key: string }).key));
    expect(picks.size).toBeGreaterThan(1);
  });
  test("goalWeight: header 1, long range up to the cap", () => {
    expect(goalWeight({ header: true, distance: 9 })).toBe(1);
    expect(goalWeight({ header: false, distance: 28 })).toBeCloseTo(2);
    expect(goalWeight({ header: false, distance: 60 })).toBe(3);
    expect(goalWeight({ header: false, distance: 15 })).toBe(1);
  });
  test("appendGoals ignores repeated keys", () => {
    const g = { key: "f:10:p" } as never;
    expect(appendGoals([g], [g, { key: "f:20:p" } as never])).toHaveLength(2);
  });
  test("goalCandidatesOfMatch keeps headers and long shots, with the club and the opponent", () => {
    const event = {
      fixtureId: "f", home: "h", away: "a", playerNames: { p: "P", q: "Q" },
      goals: [
        { playerId: "p", team: "home" as const, minute: 34, header: true, distance: 8, outsideBox: false },
        { playerId: "q", team: "away" as const, minute: 50, header: false, distance: 27, outsideBox: true, setPiece: "direct_free_kick" as const },
        { playerId: "q", team: "away" as const, minute: 60, header: false, distance: 12, outsideBox: false, setPiece: "penalty" as const },
        { playerId: "p", team: "home" as const, minute: 70, header: false, distance: 10, outsideBox: false },
      ],
    };
    const c = goalCandidatesOfMatch(event, "2027-01-02");
    expect(c).toEqual([
      { key: "f:34:p", fixtureId: "f", date: "2027-01-02", playerId: "p", playerName: "P", squadId: "h", opponentId: "a", minute: 34, header: true, distance: 8 },
      { key: "f:50:q", fixtureId: "f", date: "2027-01-02", playerId: "q", playerName: "Q", squadId: "a", opponentId: "h", minute: 50, header: false, distance: 27, setPiece: "direct_free_kick" },
    ]);
  });
});
