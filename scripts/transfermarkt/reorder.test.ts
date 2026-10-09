import { expect, test } from "bun:test";
import { COVERAGE_MIN, MIN_VALUED_PLAYERS, reorderLeague, youthCaps } from "@/../scripts/transfermarkt/reorder";

test("one line: the line's own multiset, ordered by level", () => {
  const r = reorderLeague([
    { id: "a", overall: 5.0, fromLine: "Midfielder", line: "Midfielder", level: 3 },
    { id: "b", overall: 6.5, fromLine: "Midfielder", line: "Midfielder", level: 1 },
    { id: "c", overall: 5.8, fromLine: "Midfielder", line: "Midfielder", level: 2 },
  ]);
  expect(r.get("a")).toBe(6.5);
  expect(r.get("c")).toBe(5.8);
  expect(r.get("b")).toBe(5.0);
});

test("ties broken by id, deterministic", () => {
  const r = reorderLeague([
    { id: "b", overall: 5, fromLine: "Forward", line: "Forward", level: 1 },
    { id: "a", overall: 6, fromLine: "Forward", line: "Forward", level: 1 },
  ]);
  expect(r.get("a")).toBe(6);
  expect(r.get("b")).toBe(5);
});

test("notes never cross lines: each line keeps its own multiset", () => {
  // The best-valued player is a keeper: he gets the best keeper note, not the league's best note.
  const r = reorderLeague([
    { id: "gk1", overall: 4.0, fromLine: "GK", line: "GK", level: 9 },
    { id: "gk2", overall: 4.6, fromLine: "GK", line: "GK", level: 1 },
    { id: "m1", overall: 6.0, fromLine: "Midfielder", line: "Midfielder", level: 2 },
    { id: "m2", overall: 5.0, fromLine: "Midfielder", line: "Midfielder", level: 3 },
  ]);
  expect(r.get("gk1")).toBe(4.6);
  expect(r.get("gk2")).toBe(4.0);
  expect(r.get("m2")).toBe(6.0);
  expect(r.get("m1")).toBe(5.0);
});

test("a line that grows or shrinks takes the quantiles of its old multiset", () => {
  // Defenders were 3 (6, 5, 4); one midfielder became a defender: 4 defenders, 1 midfielder left.
  const r = reorderLeague([
    { id: "d1", overall: 6, fromLine: "Defender", line: "Defender", level: 4 },
    { id: "d2", overall: 5, fromLine: "Defender", line: "Defender", level: 3 },
    { id: "d3", overall: 4, fromLine: "Defender", line: "Defender", level: 2 },
    { id: "x", overall: 7, fromLine: "Midfielder", line: "Defender", level: 1 },
    { id: "m1", overall: 3, fromLine: "Midfielder", line: "Midfielder", level: 5 },
  ]);
  // 4 targets spread over (6, 5, 4): 6, 5.333, 4.667, 4.
  expect(r.get("d1")).toBe(6);
  expect(r.get("d2")).toBeCloseTo(16 / 3, 9);
  expect(r.get("d3")).toBeCloseTo(14 / 3, 9);
  expect(r.get("x")).toBe(4);
  // One target out of (7, 3): the median.
  expect(r.get("m1")).toBe(5);
});

test("a line with no old players falls back to the league's whole old multiset", () => {
  const r = reorderLeague([
    { id: "a", overall: 6, fromLine: "Midfielder", line: "Forward", level: 2 },
    { id: "b", overall: 4, fromLine: "Midfielder", line: "Midfielder", level: 1 },
  ]);
  expect(r.get("a")).toBe(5);
  expect(r.get("b")).toBe(5);
});

test("same line counts: the line multiset is exactly preserved", () => {
  const players = [
    { id: "a", overall: 6.1, fromLine: "Defender" as const, line: "Forward" as const, level: 1 },
    { id: "b", overall: 5.2, fromLine: "Forward" as const, line: "Defender" as const, level: 2 },
    { id: "c", overall: 4.4, fromLine: "Defender" as const, line: "Defender" as const, level: 3 },
  ];
  const r = reorderLeague(players);
  expect([r.get("b"), r.get("c")].sort()).toEqual([4.4, 6.1].sort());
  expect(r.get("a")).toBe(5.2);
});

test("unmatched youth above the club's matched median is capped there", () => {
  const caps = youthCaps(
    [{ id: "y", squadId: "s", age: 19, overall: 6.2, matched: false },
     { id: "o", squadId: "s", age: 25, overall: 6.4, matched: false },
     { id: "m1", squadId: "s", age: 27, overall: 5.0, matched: true },
     { id: "m2", squadId: "s", age: 28, overall: 5.6, matched: true }],
    new Map([["m1", 5.0], ["m2", 5.6]]),
  );
  expect(caps.get("y")).toBeCloseTo(5.3, 5);
  expect(caps.has("o")).toBe(false);
});

test("coverage threshold", () => {
  expect(COVERAGE_MIN).toBe(0.4);
  expect(MIN_VALUED_PLAYERS).toBe(100);
});
