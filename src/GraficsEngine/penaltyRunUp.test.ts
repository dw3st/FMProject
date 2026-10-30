import { describe, expect, test } from "bun:test";
import { penaltyRunUp, RUN_UP } from "@/GraficsEngine/penaltyRunUp";

describe("penalty run-up", () => {
  test("starts on the spot, walks back, stops short of the ball, ends by it", () => {
    expect(penaltyRunUp(0)).toEqual({ back: 0, side: 0 });
    expect(penaltyRunUp(RUN_UP.WALK + 0.01).back).toBeCloseTo(RUN_UP.BACK_YDS);
    const stutter = penaltyRunUp((RUN_UP.RUN + RUN_UP.STUTTER) / 2);
    expect(stutter.back).toBeCloseTo(RUN_UP.STUTTER_YDS);
    expect(penaltyRunUp(1).back).toBeCloseTo(0.3);
    for (let k = 0; k <= 1; k += 0.01) expect(penaltyRunUp(k).back).toBeLessThanOrEqual(RUN_UP.BACK_YDS + 1e-9);
  });
});
