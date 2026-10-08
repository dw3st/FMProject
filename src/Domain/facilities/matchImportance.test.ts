import { describe, expect, test } from "bun:test";
import { matchImportanceMult, MATCH_IMPORTANCE } from "@/Domain/facilities/matchImportance";

describe("match importance", () => {
  test("ordinary league game = 1", () => {
    expect(matchImportanceMult({ derby: false, competition: "league", knockout: false })).toBe(1);
    // a league fixture never counts as a knockout
    expect(matchImportanceMult({ derby: false, competition: "league", knockout: true })).toBe(1);
  });

  test("factors", () => {
    expect(matchImportanceMult({ derby: true, competition: "league", knockout: false })).toBe(MATCH_IMPORTANCE.DERBY);
    expect(matchImportanceMult({ derby: false, competition: "cup", knockout: true })).toBe(MATCH_IMPORTANCE.CUP_KNOCKOUT);
    expect(matchImportanceMult({ derby: false, competition: "continental", knockout: true })).toBe(MATCH_IMPORTANCE.CONTINENTAL_KNOCKOUT);
    // group stage: no boost
    expect(matchImportanceMult({ derby: false, competition: "continental", knockout: false })).toBe(1);
  });

  test("combined by product, capped", () => {
    expect(matchImportanceMult({ derby: true, competition: "continental", knockout: true })).toBe(MATCH_IMPORTANCE.MAX);
    expect(matchImportanceMult({ derby: true, competition: "cup", knockout: true })).toBe(MATCH_IMPORTANCE.MAX); // 1,38 → 1,3
    expect(matchImportanceMult({ derby: true, competition: "continental", knockout: false })).toBe(MATCH_IMPORTANCE.DERBY);
  });
});
