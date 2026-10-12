import { describe, expect, test } from "bun:test";
import { NATIONAL_MATCH, nationalGoalScale } from "@/Domain/national/nationalMatch";

describe("nationalGoalScale", () => {
  test("AT_REF at the reference level, falling with the match level", () => {
    expect(nationalGoalScale(NATIONAL_MATCH.LEVEL_REF)).toBeCloseTo(NATIONAL_MATCH.AT_REF);
    expect(nationalGoalScale(5.4)).toBeLessThan(nationalGoalScale(4.2));
    expect(nationalGoalScale(4.2)).toBeLessThan(nationalGoalScale(3.7));
  });

  test("clamped to [MIN, MAX]", () => {
    expect(nationalGoalScale(20)).toBe(NATIONAL_MATCH.MIN);
    expect(nationalGoalScale(-5)).toBe(NATIONAL_MATCH.MAX);
  });
});
