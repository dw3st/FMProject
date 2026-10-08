import { describe, expect, test } from "bun:test";
import { coachSlots, coachGesture, GESTURE_DURATION } from "@/GraficsEngine/coaches";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";

describe("coaches", () => {
  test("left coach at 40%, right at 60%, in the bottom run-off", () => {
    const m = buildMetrics(1100, 700, { stadium: true });
    const s = coachSlots(m);
    expect(s.left.x).toBeCloseTo(m.marginX + 0.4 * m.width, 0);
    expect(s.right.x).toBeCloseTo(m.marginX + 0.6 * m.width, 0);
    expect(s.left.y).toBeGreaterThan(m.marginY + m.height);
    expect(s.left.y).toBeLessThan(m.stand!.inner.y + m.stand!.inner.h);
  });

  test("without a stadium the spot stays inside the canvas", () => {
    const m = buildMetrics(900, 520, { stadium: false });
    expect(coachSlots(m, 520).left.y).toBeLessThanOrEqual(514);
  });

  test("gestures are at rest at both ends and move in between", () => {
    for (const kind of ["attack", "defend", "balanced", "celebrate"] as const) {
      expect(coachGesture(kind, 0)).toEqual({ armL: 0, armR: 0, jumpPx: 0 });
      expect(coachGesture(kind, GESTURE_DURATION)).toEqual({ armL: 0, armR: 0, jumpPx: 0 });
      const at = kind === "defend" || kind === "celebrate" ? 0.25 : 0.5;
      const mid = coachGesture(kind, GESTURE_DURATION * at);
      expect(mid.armL + mid.armR).toBeGreaterThan(0.5);
    }
    expect(coachGesture("celebrate", GESTURE_DURATION * 0.25).jumpPx).toBeGreaterThan(3);
  });
});
