import { describe, expect, test } from "bun:test";
import {
  SCENE, ballHeight, crowdFans, curveAt, goalToPx, grassStripes, keeperDive, netPaths, netPoint, pxToGoal, shotControl,
} from "@/GameInterface/Penalty/penaltyScene";

describe("penalty scene", () => {
  test("goal space and scene px round-trip; posts at ±1, bar at 1", () => {
    expect(goalToPx({ x: -1, y: 0 })).toEqual({ x: SCENE.GX - SCENE.HALF_W, y: SCENE.LINE_Y });
    expect(goalToPx({ x: 1, y: 1 })).toEqual({ x: SCENE.GX + SCENE.HALF_W, y: SCENE.LINE_Y - SCENE.GOAL_H });
    const p = pxToGoal(250, 120);
    const back = goalToPx(p);
    expect(back.x).toBeCloseTo(250);
    expect(back.y).toBeCloseTo(120);
  });

  test("the shot curve starts on the spot, ends at the target and rises above the line", () => {
    const to = goalToPx({ x: 0.6, y: 0.4 });
    const ctrl = shotControl(SCENE.BALL_START, to, 0.7);
    expect(curveAt(SCENE.BALL_START, ctrl, to, 0)).toEqual(SCENE.BALL_START);
    expect(curveAt(SCENE.BALL_START, ctrl, to, 1)).toEqual(to);
    const mid = curveAt(SCENE.BALL_START, ctrl, to, 0.5);
    expect(ballHeight(SCENE.BALL_START, to, mid, 0.5)).toBeGreaterThan(0);
    expect(ballHeight(SCENE.BALL_START, to, SCENE.BALL_START, 0)).toBe(0);
  });

  test("the keeper dives to his side, jumps for the high areas, stays for low-mid", () => {
    expect(keeperDive("low-left").x).toBeLessThan(SCENE.GX);
    expect(keeperDive("high-right").x).toBeGreaterThan(SCENE.GX);
    expect(keeperDive("high-right").rot).toBeGreaterThan(0);
    expect(keeperDive("high-left").lift).toBeGreaterThan(keeperDive("low-left").lift);
    expect(keeperDive("low-mid")).toMatchObject({ x: SCENE.GX, rot: 0, lift: 0 });
  });

  test("the net bulges where the ball went in and settles", () => {
    const at = goalToPx({ x: 0.5, y: 0.5 });
    const bulge = { ...at, strength: 9 };
    const still = netPoint(12, 3, null, 0);
    const pushed = netPoint(12, 3, bulge, 0.05);
    expect(Math.hypot(pushed.x - still.x, pushed.y - still.y)).toBeGreaterThan(0.5);
    const later = netPoint(12, 3, bulge, 3);
    expect(Math.hypot(later.x - still.x, later.y - still.y)).toBeLessThan(0.05);
    expect(netPaths(null, 0)).toHaveLength(SCENE.NET_X + SCENE.NET_Y + 2);
  });

  test("crowd and stripes: the same fans for the same game, stripes cover the grass", () => {
    expect(crowdFans("fix_1")).toEqual(crowdFans("fix_1"));
    expect(crowdFans("fix_1")).not.toEqual(crowdFans("fix_2"));
    const s = grassStripes();
    expect(s[0]!.y).toBe(SCENE.HORIZON);
    expect(s[s.length - 1]!.y + s[s.length - 1]!.h).toBeGreaterThanOrEqual(SCENE.H);
    expect(s[s.length - 1]!.h).toBeGreaterThan(s[0]!.h);
  });
});
