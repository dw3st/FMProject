import { describe, expect, test } from "bun:test";
import { hasVar } from "@/Domain/referees/var";

describe("hasVar", () => {
  test("top division of the 10 main countries", () => {
    expect(hasVar({ competition: "premier_league" })).toBe(true);
    expect(hasVar({ competition: "of_major_league_soccer" })).toBe(true);
    expect(hasVar({ competition: "of_championship" })).toBe(false);
    expect(hasVar({ competition: "brazil_serie_b" })).toBe(false);
  });
  test("continental always", () => {
    for (const c of ["ucl", "uel", "lib", "sud"]) expect(hasVar({ competition: c })).toBe(true);
  });
  test("national cups of those countries from the quarter-finals", () => {
    expect(hasVar({ competition: "cup_england", cupStage: "r16" })).toBe(false);
    expect(hasVar({ competition: "cup_england", cupStage: "qf" })).toBe(true);
    expect(hasVar({ competition: "cup_brazil", cupStage: "final" })).toBe(true);
    expect(hasVar({ competition: "cup_england" })).toBe(false);
    expect(hasVar({ competition: "cup_scotland", cupStage: "final" })).toBe(false);
  });
  test("youth never", () => {
    expect(hasVar({ competition: "u21_england" })).toBe(false);
  });
});
