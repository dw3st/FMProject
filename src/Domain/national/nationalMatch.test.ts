import { describe, expect, test } from "bun:test";
import { NATIONAL_MATCH, nationalGoalScale } from "@/Domain/national/nationalMatch";

describe("nationalGoalScale", () => {
  test("AT_REF at the reference level, moving with the match level by the sign of SLOPE", () => {
    expect(nationalGoalScale(NATIONAL_MATCH.LEVEL_REF)).toBeCloseTo(NATIONAL_MATCH.AT_REF);
    // 90-minute engine: negative SLOPE, the factor rises with the level.
    const rises = NATIONAL_MATCH.SLOPE < 0;
    expect(nationalGoalScale(5.4) > nationalGoalScale(4.2)).toBe(rises);
    expect(nationalGoalScale(4.2) > nationalGoalScale(3.7)).toBe(rises);
  });

  test("clamped to [MIN, MAX]", () => {
    const [hi, lo] = NATIONAL_MATCH.SLOPE < 0 ? [20, -5] : [-5, 20];
    expect(nationalGoalScale(lo)).toBe(NATIONAL_MATCH.MIN);
    expect(nationalGoalScale(hi)).toBe(NATIONAL_MATCH.MAX);
  });
});
