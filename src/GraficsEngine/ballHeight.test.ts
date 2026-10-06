import { describe, expect, test } from "bun:test";
import { arcHeight, ballHeight } from "@/GraficsEngine/ballHeight";
import { BALL_HEIGHT } from "@/GraficsEngine/pitchStyle";
import type { PassKind, PassState, ShotState } from "@/GameEngine/types";

const pass = (kind: PassKind, t: number): PassState => ({
  fromId: 1, toId: kind === "regular" ? 2 : null, toX: 80, toY: 37, kind, t,
  distance: 30, receiverOffside: false, intendedRunnerId: null,
});
const shot = (t: number, header = false): ShotState => ({
  shooterId: 1, fromX: 100, fromY: 37, toX: 115, toY: 37, t, xg: 0.3, ...(header ? { header: true } : {}),
});

describe("arcHeight", () => {
  test("zero at the ends, peak at the middle", () => {
    expect(arcHeight(6, 0)).toBe(0);
    expect(arcHeight(6, 1)).toBe(0);
    expect(arcHeight(6, 0.5)).toBeCloseTo(6);
    expect(arcHeight(6, 0.25)).toBeCloseTo(4.5);
  });
  test("t outside 0..1 is clamped", () => {
    expect(arcHeight(6, -1)).toBe(0);
    expect(arcHeight(6, 2)).toBe(0);
  });
});

describe("ballHeight", () => {
  test("ground passes and no ball in flight stay at 0", () => {
    expect(ballHeight({ pass: null, shot: null })).toBe(0);
    expect(ballHeight({ pass: pass("regular", 0.5), shot: null })).toBe(0);
    expect(ballHeight({ pass: pass("through", 0.5), shot: null })).toBe(0);
  });
  test("high balls peak at their kind's height", () => {
    expect(ballHeight({ pass: pass("cross", 0.5), shot: null })).toBeCloseTo(BALL_HEIGHT.CROSS);
    expect(ballHeight({ pass: pass("long_ball", 0.5), shot: null })).toBeCloseTo(BALL_HEIGHT.LONG_BALL);
    expect(ballHeight({ pass: pass("clearance", 0.5), shot: null })).toBeCloseTo(BALL_HEIGHT.CLEARANCE);
  });
  test("shots and headers", () => {
    expect(ballHeight({ pass: null, shot: shot(0.5) })).toBeCloseTo(BALL_HEIGHT.SHOT);
    expect(ballHeight({ pass: null, shot: shot(0.5, true) })).toBeCloseTo(BALL_HEIGHT.HEADER);
  });
  test("a shot wins over a stale pass", () => {
    expect(ballHeight({ pass: pass("cross", 0.5), shot: shot(0.5) })).toBeCloseTo(BALL_HEIGHT.SHOT);
  });
});
