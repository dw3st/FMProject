import { describe, expect, test } from "bun:test";
import { PITCH_LENGTH, PITCH_WIDTH } from "@/GameEngine/Domain/pitch";
import { mirrorX, mirrorY } from "@/GraficsEngine/pitchMirror";

describe("mirrorX", () => {
  test("no mirror keeps x", () => {
    expect(mirrorX(10, false)).toBe(10);
  });
  test("mirror flips around the centre line", () => {
    expect(mirrorX(0, true)).toBe(PITCH_LENGTH);
    expect(mirrorX(PITCH_LENGTH, true)).toBe(0);
    expect(mirrorX(PITCH_LENGTH / 2, true)).toBe(PITCH_LENGTH / 2);
  });
  test("is its own inverse", () => {
    for (const x of [0, 12.5, 57.5, 100, PITCH_LENGTH]) expect(mirrorX(mirrorX(x, true), true)).toBeCloseTo(x);
  });
});

describe("mirrorY (#142: the mirror is a 180° turn, not a reflection)", () => {
  test("no mirror keeps y", () => {
    expect(mirrorY(8, false)).toBe(8);
  });
  test("mirror flips across the halfway width", () => {
    expect(mirrorY(0, true)).toBe(PITCH_WIDTH);
    expect(mirrorY(8, true)).toBe(PITCH_WIDTH - 8);
    expect(mirrorY(mirrorY(20, true), true)).toBeCloseTo(20);
  });
  test("a team keeps its left on its left when drawn mirrored", () => {
    // Team A attacks +x; its left winger stands at y 8 (its left = the top when facing right).
    // Mirrored, it attacks to the left of the screen, so its left must be drawn at the bottom.
    const drawnDir = mirrorX(PITCH_LENGTH, true) - mirrorX(0, true); // < 0: drawn attacking left
    expect(drawnDir).toBeLessThan(0);
    expect(mirrorY(8, true)).toBeGreaterThan(PITCH_WIDTH / 2);
  });
});
