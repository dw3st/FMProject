import { describe, expect, test } from "bun:test";
import { CROWD_MOTION, fanLooks, fanPose, handFlagAngle } from "@/GraficsEngine/crowdMotion";

const C = CROWD_MOTION;

describe("crowd motion", () => {
  const seats = Array.from({ length: 300 }, (_, i) => ({ x: (i % 30) * 6, y: Math.floor(i / 30) * 6, team: i % 30 < 24 ? "home" as const : "away" as const }));

  test("looks are deterministic, in range, and only home fans wear scarves", () => {
    const a = fanLooks(seats, 6, "s");
    expect(fanLooks(seats, 6, "s")).toEqual(a);
    expect(a.every((l) => l.skin >= 0 && l.skin < C.SKINS && l.hair >= 0 && l.hair <= C.HAIRS + 1)).toBe(true);
    expect(a.some((l) => l.scarf)).toBe(true);
    expect(a.every((l, i) => !l.scarf || seats[i]!.team === "home")).toBe(true);
  });

  test("a section's fans bounce in close phase", () => {
    const looks = fanLooks(seats.slice(0, 7), 6, "s"); // first 7 seats: one 42 px section
    const ph = looks.map((l) => l.phase);
    expect(Math.max(...ph) - Math.min(...ph)).toBeLessThanOrEqual(C.JITTER + 1e-9);
  });

  test("the bounce is smooth and small, never below the seat; arms down", () => {
    const fan = { x: 0, y: 0, phase: 0.4, speed: 1 };
    let prev: number | null = null;
    for (let t = 0; t < 6; t += 1 / 60) {
      const p = fanPose(fan, t, 10, { x: 500, y: 300 }, 1e9, null);
      expect(p.lift).toBeGreaterThanOrEqual(0);
      expect(p.lift).toBeLessThanOrEqual(C.BOUNCE * 10 + 1e-9);
      expect(p.arms).toBe(0);
      if (prev !== null) expect(Math.abs(p.lift - prev)).toBeLessThan(0.15); // no jumps between frames
      prev = p.lift;
    }
  });

  test("the wave raises the arms as it passes, then they come down", () => {
    const fan = { x: 0, y: 300, phase: -Math.PI / 2, speed: 1 }; // left of the centre: the wave starts there
    const centre = { x: 500, y: 300 };
    const passing = fanPose(fan, 0, 10, centre, 0, null);
    expect(passing.arms).toBeGreaterThan(0.9);
    expect(passing.lift).toBeGreaterThan(C.BOUNCE * 10);
    expect(fanPose(fan, C.WAVE_LAP_S + 1, 10, centre, 0, null).arms).toBe(0);
  });

  test("a goal raises the arms and fades out", () => {
    const fan = { x: 0, y: 0, phase: 0, speed: 1 };
    expect(fanPose(fan, 5, 10, { x: 500, y: 300 }, 1e9, 0.3).arms).toBe(1);
    expect(fanPose(fan, 5, 10, { x: 500, y: 300 }, 1e9, C.GOAL_S + 0.1).arms).toBe(0);
  });

  test("hand flags swing", () => {
    const flagFan = fanLooks(seats, 6, "s").find((l) => l.flag)!;
    expect(flagFan).toBeDefined();
    expect(Math.abs(handFlagAngle(flagFan, 1.2, 0))).toBeLessThanOrEqual(C.HAND_FLAG.SWING);
  });
});
