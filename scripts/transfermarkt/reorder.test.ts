import { expect, test } from "bun:test";
import { COVERAGE_MIN, reorderLeague, youthCaps } from "@/../scripts/transfermarkt/reorder";

test("matched players get the league's own multiset, ordered by level", () => {
  const r = reorderLeague([
    { id: "a", overall: 5.0, level: 3 },
    { id: "b", overall: 6.5, level: 1 },
    { id: "c", overall: 5.8, level: 2 },
  ]);
  expect(r.get("a")).toBe(6.5);
  expect(r.get("c")).toBe(5.8);
  expect(r.get("b")).toBe(5.0);
});

test("ties broken by id, deterministic", () => {
  const r = reorderLeague([{ id: "b", overall: 5, level: 1 }, { id: "a", overall: 6, level: 1 }]);
  expect(r.get("a")).toBe(6);
  expect(r.get("b")).toBe(5);
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

test("coverage threshold", () => expect(COVERAGE_MIN).toBe(0.6));
