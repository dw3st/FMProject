import { describe, expect, test } from "bun:test";
import { tablePositions } from "@/Domain/match/tablePositions";
import type { StandingRow } from "@/types/playerTypes";

const row = (squadId: string, mp: number): StandingRow => ({
  squadId, name: squadId, colors: ["#000", "#fff"], mp, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [],
});

describe("tablePositions", () => {
  test("positions in table order for both clubs", () => {
    const table = [row("a", 3), row("b", 3), row("c", 3)];
    expect(tablePositions(table, ["c", "a"])).toEqual({ c: 3, a: 1 });
  });
  test("a club out of the table has no position", () => {
    expect(tablePositions([row("a", 1)], ["a", "x"])).toEqual({ a: 1 });
  });
  test("nothing before the first round or without a table", () => {
    expect(tablePositions([row("a", 0), row("b", 0)], ["a", "b"])).toEqual({});
    expect(tablePositions(null, ["a"])).toEqual({});
  });
});
