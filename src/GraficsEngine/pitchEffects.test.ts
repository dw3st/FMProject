import { describe, expect, test } from "bun:test";
import {
  addEffect, advanceEffectClock, effectAlpha, effectProgress, liveEffects,
  liveTrail, pushTrail, shouldTrail,
} from "@/GraficsEngine/pitchEffects";
import { EFFECT_DURATION, TRAIL } from "@/GraficsEngine/pitchStyle";
import type { PassKind, PassState, ShotState } from "@/GameEngine/types";

describe("effect clock", () => {
  test("advances only while not paused, in real seconds", () => {
    expect(advanceEffectClock(1, 0.5, false)).toBeCloseTo(1.5);
    expect(advanceEffectClock(1, 0.5, true)).toBe(1);
  });
});

describe("effect queue", () => {
  test("added with its kind's duration and expires after it", () => {
    const list = addEffect([], { kind: "foul", x: 50, y: 30 }, 10);
    expect(list).toHaveLength(1);
    expect(list[0]!.duration).toBe(EFFECT_DURATION.foul);
    expect(list[0]!.startedAt).toBe(10);
    expect(liveEffects(list, 10 + EFFECT_DURATION.foul - 0.01)).toHaveLength(1);
    expect(liveEffects(list, 10 + EFFECT_DURATION.foul)).toHaveLength(0);
  });
  test("full alpha until the fade, then down to 0", () => {
    const [e] = addEffect([], { kind: "card", x: 1, y: 1, card: "yellow", name: "A" }, 0);
    expect(effectAlpha(e!, 0)).toBe(1);
    expect(effectAlpha(e!, EFFECT_DURATION.card * 0.7)).toBeCloseTo(1);
    expect(effectAlpha(e!, EFFECT_DURATION.card * 0.85)).toBeCloseTo(0.5);
    expect(effectAlpha(e!, EFFECT_DURATION.card)).toBe(0);
  });
  test("progress 0..1", () => {
    const [e] = addEffect([], { kind: "offside", lineX: 80, x: 85, y: 30 }, 2);
    expect(effectProgress(e!, 2)).toBe(0);
    expect(effectProgress(e!, 2 + EFFECT_DURATION.offside / 2)).toBeCloseTo(0.5);
    expect(effectProgress(e!, 100)).toBe(1);
  });
});

const pass = (kind: PassKind, distance: number): PassState => ({
  fromId: 1, toId: kind === "regular" ? 2 : null, toX: 80, toY: 37, kind, t: 0.5,
  distance, receiverOffside: false, intendedRunnerId: null,
});
const shot: ShotState = { shooterId: 1, fromX: 100, fromY: 37, toX: 115, toY: 37, t: 0.5, xg: 0.3 };

describe("ball trail", () => {
  test("only shots, high balls and long passes leave a trail", () => {
    expect(shouldTrail({ pass: null, shot: null })).toBe(false);
    expect(shouldTrail({ pass: null, shot })).toBe(true);
    expect(shouldTrail({ pass: pass("cross", 10), shot: null })).toBe(true);
    expect(shouldTrail({ pass: pass("regular", TRAIL.MIN_PASS_YDS), shot: null })).toBe(true);
    expect(shouldTrail({ pass: pass("regular", TRAIL.MIN_PASS_YDS - 1), shot: null })).toBe(false);
  });
  test("points are added while flying and dropped after TRAIL.SECONDS", () => {
    let pts = pushTrail([], { x: 1, y: 1 }, 0);
    pts = pushTrail(pts, { x: 2, y: 2 }, 0.1);
    pts = pushTrail(pts, null, 0.2);
    expect(pts).toHaveLength(2);
    expect(liveTrail(pts, TRAIL.SECONDS + 0.05)).toHaveLength(1);
    expect(liveTrail(pts, TRAIL.SECONDS + 0.2)).toHaveLength(0);
  });
});
