import { describe, expect, test } from "bun:test";
import { AGE_MEDIAN_DAMPEN_K, ageDelta, agePlayerStats, topDeclineFactor, youngGrowthDampen } from "@/../scripts/espn/aging";
import type { PlayerStatsRecord } from "@/types/playerTypes";

const base: PlayerStatsRecord = {
  passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5,
  pressing: 5, stamina: 5, heading: 5, strength: 5, reflex: 1, jump: 1,
};
const outfield: Record<string, number> = { passing: 1, vision: 1, finishing: 1, dribbling: 1, speed: 1, acceleration: 1, tackling: 1, pressing: 1, stamina: 1, heading: 1, strength: 1 };
const sum = (s: PlayerStatsRecord) => Object.values(s).reduce((a, b) => a + b, 0);

describe("ageDelta", () => {
  test("bands", () => {
    expect(ageDelta(19)).toBe(0.6);
    expect(ageDelta(24)).toBe(0.3);
    expect(ageDelta(27)).toBe(0.1);
    expect(ageDelta(29)).toBe(0);
    expect(ageDelta(31)).toBe(-0.2);
    expect(ageDelta(33)).toBe(-0.4);
    expect(ageDelta(36)).toBe(-0.6);
  });
});

describe("agePlayerStats", () => {
  test("zero years leaves the stats unchanged", () => {
    expect(agePlayerStats("p", base, 25, 25, outfield)).toEqual(base);
  });
  test("deterministic", () => {
    expect(agePlayerStats("p", base, 19, 21, outfield)).toEqual(agePlayerStats("p", base, 19, 21, outfield));
  });
  test("a young player grows, a veteran declines", () => {
    expect(sum(agePlayerStats("y", base, 19, 21, outfield))).toBeGreaterThan(sum(base));
    expect(sum(agePlayerStats("v", base, 33, 35, outfield))).toBeLessThan(sum(base));
  });
  test("decline hits physical attributes harder", () => {
    const after = agePlayerStats("v", { ...base, speed: 8, acceleration: 8, stamina: 8, passing: 8, vision: 8, tackling: 8 }, 34, 36, outfield);
    const phys = 24 - (after.speed + after.acceleration + after.stamina);
    const tech = 24 - (after.passing + after.vision + after.tackling);
    expect(phys).toBeGreaterThan(tech);
  });
  test("soft cap: a 10 stays 10 and never exceeds it", () => {
    const after = agePlayerStats("c", { ...base, finishing: 10 }, 18, 20, outfield);
    expect(after.finishing).toBe(10);
  });
  test("stats with zero role weight do not move", () => {
    const after = agePlayerStats("g", base, 18, 20, outfield);
    expect(after.reflex).toBe(1);
    expect(after.jump).toBe(1);
  });
  test("caps the gap at two years", () => {
    expect(agePlayerStats("p", base, 18, 23, outfield)).toEqual(agePlayerStats("p", base, 18, 20, outfield));
  });
});

describe("#14 — youngGrowthDampen", () => {
  test("at the median: full growth (1)", () => {
    expect(youngGrowthDampen(6, 6)).toBe(1);
  });
  test("below the median: still full growth, never boosted above 1", () => {
    expect(youngGrowthDampen(4, 6)).toBe(1);
  });
  test(`AGE_MEDIAN_DAMPEN_K (${AGE_MEDIAN_DAMPEN_K}) points above the median: floored at 0.25`, () => {
    expect(youngGrowthDampen(6 + AGE_MEDIAN_DAMPEN_K, 6)).toBe(0.25);
    expect(youngGrowthDampen(6 + AGE_MEDIAN_DAMPEN_K * 10, 6)).toBe(0.25);
  });
  test("linear in between", () => {
    expect(youngGrowthDampen(6 + AGE_MEDIAN_DAMPEN_K / 2, 6)).toBeCloseTo(0.5, 9);
  });
});

describe("#14 — growthDampen reduces growth for a young player above the club median, decline unaffected", () => {
  test("dampen < 1 grows the young player less than dampen 1", () => {
    const full = agePlayerStats("y", base, 19, 21, outfield, 1);
    const half = agePlayerStats("y", base, 19, 21, outfield, 0.5);
    expect(sum(half)).toBeLessThan(sum(full));
    expect(sum(half)).toBeGreaterThanOrEqual(sum(base));
  });
  test("dampen 0.25 (fully clamped) still grows a little, never shrinks", () => {
    const dampened = agePlayerStats("y", base, 19, 21, outfield, 0.25);
    expect(sum(dampened)).toBeGreaterThan(sum(base));
  });
  test("growthDampen never affects a veteran's decline", () => {
    const full = agePlayerStats("v", base, 33, 35, outfield, 1);
    const dampened = agePlayerStats("v", base, 33, 35, outfield, 0.25);
    expect(dampened).toEqual(full);
  });
  test("default growthDampen (omitted) behaves exactly like 1 — backward compatible", () => {
    expect(agePlayerStats("y", base, 19, 21, outfield)).toEqual(agePlayerStats("y", base, 19, 21, outfield, 1));
  });
  test("deterministic with growthDampen", () => {
    expect(agePlayerStats("y", base, 19, 21, outfield, 0.6)).toEqual(agePlayerStats("y", base, 19, 21, outfield, 0.6));
  });
});

describe("topDeclineFactor (#6)", () => {
  test("1 up to p90, halves at p100, clamped", () => {
    expect(topDeclineFactor(0.5)).toBe(1);
    expect(topDeclineFactor(0.9)).toBe(1);
    expect(topDeclineFactor(0.95)).toBeCloseTo(0.75);
    expect(topDeclineFactor(1)).toBeCloseTo(0.5);
  });
  test("attenuates decline only, never growth", () => {
    const hi = { ...base, passing: 9, vision: 9, finishing: 9, dribbling: 9 };
    const full = agePlayerStats("p1", hi, 33, 35, outfield);
    const soft = agePlayerStats("p1", hi, 33, 35, outfield, 1, 0.5);
    expect(sum(soft)).toBeGreaterThan(sum(full));
    const youngFull = agePlayerStats("p2", base, 19, 21, outfield);
    expect(agePlayerStats("p2", base, 19, 21, outfield, 1, 0.5)).toEqual(youngFull);
  });
});
