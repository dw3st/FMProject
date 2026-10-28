import { describe, expect, test } from "bun:test";
import { benchKits, benchLook, benchPose, benchLayout, benchRows, benchShown, BENCH_VIEW, photographerSpots } from "@/GraficsEngine/benchView";

describe("bench view", () => {
  test("keepers wear their own colours, two keepers two colours, never close to the kit", () => {
    const kits = benchKits(["GK", "CB", "ST", "GK", "CM"], 0xda291c);
    expect(kits[1]).toBe(0xda291c);
    expect(kits[2]).toBe(0xda291c);
    expect(kits[0]).not.toBe(0xda291c);
    expect(kits[3]).not.toBe(0xda291c);
    expect(kits[0]).not.toBe(kits[3]);
    // A yellow outfield kit skips the yellow keeper kit.
    expect(benchKits(["GK"], 0xf2c230)[0]).not.toBe(0xf2c230);
  });

  test("looks are stable per player", () => {
    expect(benchLook("p7")).toEqual(benchLook("p7"));
  });

  test("idle: looks toward the ball, stays mostly seated; a goal gets everyone up with the arms raised", () => {
    const left = benchPose(0, 1, -300, -1, null);
    expect(left.lookX).toBeLessThan(0);
    expect(left.lookY).toBeLessThan(0);
    expect(left.arms).toBe(0);
    const goal = benchPose(0, 1, 0, -1, 0.5);
    expect(goal.up).toBe(1);
    expect(goal.arms).toBeGreaterThan(0.6);
    expect(benchPose(0, 1, 0, -1, BENCH_VIEW.GOAL_S + 0.1).arms).toBe(0);
  });
});

describe("bench layout", () => {
  test("a matchday bench: at most nine, both keepers kept, in squad order", () => {
    const roles = ["CB", "ST", "CM", "LB", "RW", "CDM", "CAM", "LW", "RB", "CM", "ST", "GK", "GK", "GK"];
    const shown = benchShown(roles);
    expect(shown.length).toBe(BENCH_VIEW.MAX_SHOWN);
    expect(shown.filter((i) => roles[i] === "GK").length).toBe(2);
    expect([...shown].sort((a, b) => a - b)).toEqual(shown);
  });

  test("two rows, the back row away from the pitch", () => {
    const seats = benchRows(9, 100, 50, 80, 4, -1);
    expect(seats.length).toBe(9);
    expect(seats.filter((s) => s.y > 50).length).toBe(5); // pitch above: back row below
    expect(seats.filter((s) => s.y < 50).length).toBe(4);
  });
});

describe("bench off the pitch", () => {
  test("one row inside the dugout, every figure smaller than a player", () => {
    const L = benchLayout(9, 300, 120, 710, 740, 0, 20);
    expect(L.box.y).toBe(710);
    expect(L.fig).toBeLessThanOrEqual(20 * 0.4);
    for (const s of L.seats) {
      expect(s.y - L.fig).toBeGreaterThan(710);
      expect(s.y + L.fig).toBeLessThan(740);
      expect(Math.abs(s.x - 300)).toBeLessThanOrEqual(60);
    }
  });
});

describe("photographers", () => {
  test("a different spread per match, never between the posts, stable per seed", () => {
    const a = photographerSpots("fixture-1"), b = photographerSpots("fixture-2");
    expect(a).toEqual(photographerSpots("fixture-1"));
    expect(a).not.toEqual(b);
    for (const s of [...a, ...b]) {
      expect(a.length).toBeGreaterThanOrEqual(8);
      if (s.side !== "top") expect(Math.abs(s.along)).toBeGreaterThanOrEqual(6);
      else expect(Math.abs(s.along)).toBeLessThanOrEqual(50);
    }
  });
});
