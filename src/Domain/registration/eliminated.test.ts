import { describe, expect, test } from "bun:test";
import { outOfCompetition } from "@/Domain/registration/eliminated";
import type { Fixture } from "@/types/calendarTypes";

const fx = (p: Partial<Fixture>): Fixture => ({
  id: "f", date: "2031-10-01", competition: "c", round: 1, home: "a", away: "b", played: false, result: null, ...p,
} as Fixture);

describe("outOfCompetition (4.47.19)", () => {
  test("a lost cup tie puts the club out", () => {
    const f = [fx({ knockout: true, played: true, result: { home: 2, away: 3 } })];
    expect(outOfCompetition(f, "a", null)).toBe(true);
    expect(outOfCompetition(f, "b", null)).toBe(false);
  });
  test("a match still to play keeps the club in", () => {
    const f = [fx({ knockout: true, played: true, result: { home: 3, away: 0 } }), fx({ id: "g", round: 2, knockout: true })];
    expect(outOfCompetition(f, "a", null)).toBe(false);
  });
  test("a lost two-legged tie and a group-stage exit", () => {
    const f = [
      fx({ id: "1", knockout: true, tieId: "t", leg: 1, played: true, result: { home: 1, away: 0 } }),
      fx({ id: "2", knockout: true, tieId: "t", leg: 2, home: "b", away: "a", played: true, result: { home: 3, away: 0 } }),
      fx({ id: "3", home: "c", away: "d", played: true, result: { home: 0, away: 0 } }),
    ];
    expect(outOfCompetition(f, "a", null)).toBe(true);
    expect(outOfCompetition(f, "c", null)).toBe(true);
  });
  test("once it has a champion, everyone but the champion is out", () => {
    const f = [fx({ knockout: true, played: true, result: { home: 1, away: 0 } })];
    expect(outOfCompetition(f, "a", "a")).toBe(false);
    expect(outOfCompetition(f, "b", "a")).toBe(true);
  });
});

describe("outOfCompetition (league phase, 12.13)", () => {
  test("a top-8 club waits for the round of 16 without a knockout fixture; 25th-36th is out", () => {
    const f = [
      fx({ id: "1", home: "c", away: "d", played: true, result: { home: 1, away: 0 } }),
      fx({ id: "2", round: 9, home: "x", away: "y", knockout: true, tieId: "t", leg: 1 }),
    ];
    expect(outOfCompetition(f, "c", null, { c: 3, d: 30 })).toBe(false);
    expect(outOfCompetition(f, "d", null, { c: 3, d: 30 })).toBe(true);
  });
});
