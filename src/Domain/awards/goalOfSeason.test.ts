import { describe, expect, test } from "bun:test";
import { goalGeometry, sanitizeRecordedGoals } from "@/Domain/awards/goalOfSeason";

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
