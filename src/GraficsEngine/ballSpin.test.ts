import { describe, expect, test } from "bun:test";
import { nextSpinAngle } from "@/GraficsEngine/ballSpin";

describe("nextSpinAngle", () => {
  test("accumulates distance / radius in the direction of travel", () => {
    const a = nextSpinAngle(0, { x: 0, y: 0 }, { x: 6, y: 0 }, 6, false, 100);
    expect(a).toBeCloseTo(1);
    expect(nextSpinAngle(a, { x: 6, y: 0 }, { x: 0, y: 0 }, 6, false, 100)).toBeCloseTo(0);
  });
  test("no spin on a teleport", () => {
    expect(nextSpinAngle(2, { x: 0, y: 0 }, { x: 500, y: 0 }, 6, false, 36)).toBe(2);
  });
  test("no spin while paused, without a previous position or standing still", () => {
    expect(nextSpinAngle(2, { x: 0, y: 0 }, { x: 5, y: 0 }, 6, true, 36)).toBe(2);
    expect(nextSpinAngle(2, null, { x: 5, y: 0 }, 6, false, 36)).toBe(2);
    expect(nextSpinAngle(2, { x: 5, y: 5 }, { x: 5, y: 5 }, 6, false, 36)).toBe(2);
  });
});

describe("nextSpinAngle cap", () => {
  test("a fast ball spins at most maxStep per frame", () => {
    expect(nextSpinAngle(0, { x: 0, y: 0 }, { x: 30, y: 0 }, 6, false, 100, 0.35)).toBeCloseTo(0.35);
    expect(nextSpinAngle(0, { x: 0, y: 0 }, { x: -30, y: 0 }, 6, false, 100, 0.35)).toBeCloseTo(-0.35);
    expect(nextSpinAngle(0, { x: 0, y: 0 }, { x: 1.2, y: 0 }, 6, false, 100, 0.35)).toBeCloseTo(0.2);
  });
});
