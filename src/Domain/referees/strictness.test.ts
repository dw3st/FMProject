import { describe, expect, test } from "bun:test";
import { refereeFoulMult, refereeRedMult, refereeYellowMult, strictnessBand, strictnessOf } from "@/Domain/referees/strictness";

describe("referee strictness", () => {
  test("neutral is exactly 1", () => {
    for (const f of [refereeFoulMult, refereeYellowMult, refereeRedMult]) { expect(f(0)).toBe(1); expect(f(undefined)).toBe(1); }
  });
  test("deterministic per id, in [-1,1], world mean ~0", () => {
    expect(strictnessOf("ref_Q1")).toBe(strictnessOf("ref_Q1"));
    const xs = Array.from({ length: 4000 }, (_, i) => strictnessOf(`ref_g_x_${i}`));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1);
    expect(Math.max(...xs)).toBeLessThanOrEqual(1);
    expect(Math.abs(xs.reduce((a, b) => a + b, 0) / xs.length)).toBeLessThan(0.03);
  });
  test("strict ±0.75 → yellows ×1.3..1.5", () => {
    const r = (refereeFoulMult(0.75) * refereeYellowMult(0.75)) / (refereeFoulMult(-0.75) * refereeYellowMult(-0.75));
    expect(r).toBeGreaterThan(1.3); expect(r).toBeLessThan(1.5);
  });
  test("bands", () => {
    expect(strictnessBand(-0.5)).toBe("lenient"); expect(strictnessBand(0)).toBe("balanced"); expect(strictnessBand(0.4)).toBe("strict");
  });
});
