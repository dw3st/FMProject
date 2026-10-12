import { describe, expect, test } from "bun:test";
import { eloAfterMatch, expectedResult, importanceOf, initialPoints, rankTeams } from "@/Domain/national/elo";

describe("elo (FIFA SUM)", () => {
  test("expected result and importance", () => {
    expect(expectedResult(1500, 1500)).toBeCloseTo(0.5, 6);
    expect(expectedResult(1600, 1400)).toBeGreaterThan(0.6);
    expect(importanceOf({ kind: "friendly" })).toBe(10);
    expect(importanceOf({ kind: "tournament", tournament: "wc", stage: "qf" })).toBe(60);
    expect(importanceOf({ kind: "tournament", tournament: "euro", stage: "group" })).toBe(35);
  });

  test("a draw between equals changes nothing; a win moves I/2", () => {
    expect(eloAfterMatch({ home: 1500, away: 1500, score: { home: 1, away: 1 }, match: { kind: "qualifier" } })).toEqual({ home: 1500, away: 1500 });
    expect(eloAfterMatch({ home: 1500, away: 1500, score: { home: 2, away: 0 }, match: { kind: "qualifier" } })).toEqual({ home: 1512.5, away: 1487.5 });
  });

  test("knockout losses of a final tournament never cost points; shootouts score 0.75 / 0.5", () => {
    const r = eloAfterMatch({ home: 1700, away: 1400, score: { home: 0, away: 1 }, match: { kind: "tournament", tournament: "wc", stage: "r16" } });
    expect(r.home).toBe(1700);
    expect(r.away).toBeGreaterThan(1400);
    const s = eloAfterMatch({ home: 1500, away: 1500, score: { home: 1, away: 1 }, shootoutWinner: "away", match: { kind: "tournament", tournament: "euro", stage: "qf" } });
    expect(s.away).toBe(1510);
    expect(s.home).toBe(1500);
  });

  test("initial points and ranking", () => {
    expect(initialPoints(3)).toBe(1000);
    expect(initialPoints(20)).toBe(1900);
    expect(rankTeams([{ nation: "B", elo: 1 }, { nation: "A", elo: 1 }, { nation: "C", elo: 5 }]).map((t) => t.nation)).toEqual(["C", "A", "B"]);
  });
});
