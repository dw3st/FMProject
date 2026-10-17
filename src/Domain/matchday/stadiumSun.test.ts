import { describe, expect, test } from "bun:test";
import { stadiumSunSide } from "@/Domain/matchday/stadiumSun";

describe("stadiumSunSide", () => {
  test("deterministic, both sides used, lean in -1..1", () => {
    expect(stadiumSunSide("33")).toEqual(stadiumSunSide("33"));
    const all = Array.from({ length: 200 }, (_, i) => stadiumSunSide(`c${i}`));
    expect(new Set(all.map((s) => s.side))).toEqual(new Set(["top", "bottom"]));
    for (const s of all) { expect(s.lean).toBeGreaterThanOrEqual(-1); expect(s.lean).toBeLessThanOrEqual(1); }
  });
});
