import { describe, expect, test } from "bun:test";
import { PITCH_LENGTH } from "@/GameEngine/Domain/pitch";
import { mirrorX } from "@/GraficsEngine/pitchMirror";

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
