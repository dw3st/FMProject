import { describe, expect, test } from "bun:test";
import { ageDelta, agePlayerStats } from "@/../scripts/espn/aging";
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
