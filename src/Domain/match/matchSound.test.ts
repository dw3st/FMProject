import { describe, expect, test } from "bun:test";
import { crowdExcitement, cueAllowed } from "@/Domain/match/matchSound";

describe("match sound", () => {
  test("the crowd is quiet in midfield and loud near a goal", () => {
    expect(crowdExcitement({ x: 57.5, y: 37 })).toBe(0);
    expect(crowdExcitement({ x: 5, y: 37 })).toBeGreaterThan(0.8);
    expect(crowdExcitement({ x: 110, y: 37 })).toBeGreaterThan(0.8);
    expect(crowdExcitement({ x: 110, y: 1 })).toBeLessThan(crowdExcitement({ x: 110, y: 37 }));
  });

  test("a cue does not repeat faster than its gap", () => {
    const last = new Map();
    expect(cueAllowed(last, "pass", 1)).toBe(true);
    expect(cueAllowed(last, "pass", 1.05)).toBe(false);
    expect(cueAllowed(last, "kick", 1.05)).toBe(true);
    expect(cueAllowed(last, "pass", 1.3)).toBe(true);
  });
});
