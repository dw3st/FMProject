import { describe, expect, test } from "bun:test";
import {
  benchRect, benchSeats, coachWalkOffset, COACH_WALK_FRAC, crowdJumpPx, CROWD_JUMP_S, netShake,
  startStretcher, stretcherPose, STRETCHER, STRETCHER_TOTAL_S,
} from "@/GraficsEngine/matchExtras";

const m = { marginX: 20, marginY: 30, width: 1000, height: 640 };

describe("stretcher (#129)", () => {
  test("comes from the nearest touchline, waits by the player, leaves carrying him", () => {
    const near = startStretcher({ x: 400, y: 600 }, m, 10);
    expect(near.entry.y).toBeGreaterThan(m.marginY + m.height);
    const far = startStretcher({ x: 400, y: 60 }, m, 10);
    expect(far.entry.y).toBeLessThan(m.marginY);
    expect(stretcherPose(near, 10)).toMatchObject({ x: 400, y: near.entry.y, carrying: false, done: false });
    const by = stretcherPose(near, 10 + STRETCHER.IN_S + STRETCHER.HOLD_S / 2);
    expect(by).toMatchObject({ x: 400, y: 600, carrying: false });
    const out = stretcherPose(near, 10 + STRETCHER.IN_S + STRETCHER.HOLD_S + STRETCHER.OUT_S / 2);
    expect(out.carrying).toBe(true);
    expect(out.y).toBeGreaterThan(600);
    expect(stretcherPose(near, 10 + STRETCHER_TOTAL_S + 0.01).done).toBe(true);
  });
});

describe("managers and benches", () => {
  test("a manager never walks out of his area", () => {
    const half = m.width * COACH_WALK_FRAC;
    for (let t = 0; t < 200; t += 0.37) expect(Math.abs(coachWalkOffset(t, 1.3, half))).toBeLessThanOrEqual(half + 1e-9);
  });

  test("the bench sits outside the walking area, on the outer side", () => {
    const spot = { x: 420, y: 700 };
    const half = m.width * COACH_WALK_FRAC;
    const left = benchRect(spot, "left", m, 10);
    expect(left.x + left.w).toBeLessThan(spot.x - half);
    const right = benchRect(spot, "right", m, 10);
    expect(right.x).toBeGreaterThan(spot.x + half);
    const seats = benchSeats(right, 7);
    expect(seats).toHaveLength(7);
    for (const s of seats) expect(s.x).toBeGreaterThan(right.x);
    expect(benchSeats(right, 0)).toEqual([]);
  });
});

describe("goal", () => {
  test("the net and the fans are at rest at the start and the end", () => {
    expect(netShake(0)).toBe(0);
    expect(netShake(1)).toBe(0);
    expect(Math.abs(netShake(1 / 12))).toBeGreaterThan(0.5);
    expect(crowdJumpPx(0, 3)).toBe(0);
    expect(crowdJumpPx(CROWD_JUMP_S, 3)).toBe(0);
    expect(crowdJumpPx(CROWD_JUMP_S / 6, 3)).toBeLessThan(-2);
    for (let t = 0; t < CROWD_JUMP_S; t += 0.05) expect(crowdJumpPx(t, 3)).toBeLessThanOrEqual(0);
  });
});
