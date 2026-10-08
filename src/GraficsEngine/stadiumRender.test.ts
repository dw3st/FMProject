import { describe, expect, test } from "bun:test";
import { goalPulseAlpha } from "@/GraficsEngine/stadiumRender";
import { STADIUM } from "@/GraficsEngine/pitchStyle";

describe("crowd goal pulse", () => {
  test("starts and ends at full alpha, dips to 0.85 halfway", () => {
    expect(goalPulseAlpha(0)).toBe(1);
    expect(goalPulseAlpha(STADIUM.GOAL_PULSE_S)).toBe(1);
    expect(goalPulseAlpha(STADIUM.GOAL_PULSE_S / 2)).toBeCloseTo(0.85, 9);
    expect(goalPulseAlpha(-1)).toBe(1);
  });
});
