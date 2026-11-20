import { describe, expect, test } from "bun:test";
import {
  aimPoint, applyShotError, blockChances, chooseTechnique, classifyCrossing, dipLaunch, directLaunch, lineCrossing,
  saveChances, shotErrorFactor,
} from "@/GameEngine/Domain/ShotPhysics";
import { passErrorFactor } from "@/GameEngine/Domain/PassError";
import { BALL_PHYSICS } from "@/GameEngine/Configs/BallPhysicsConfig";
import { GOAL_Y_MAX, GOAL_Y_MIN } from "@/GameEngine/Domain/pitch";

const fly = (from: { x: number; y: number; z: number }, v: { vx: number; vy: number; vz: number }, s: number) => {
  const vh = Math.hypot(v.vx, v.vy);
  const t = s / vh;
  return v.vz * t - 0.5 * BALL_PHYSICS.GRAVITY * t * t + from.z;
};

describe("ShotPhysics (stage 7)", () => {
  test("technique by situation", () => {
    const base = { distYd: 14, keeperOffLine: 1, keeperGap: 13, keeperAhead: true, ballZ: 0.1, skill: 0.7 };
    expect(chooseTechnique({ ...base, ballZ: 0.5 }, () => 0.99)).toBe("volley");
    expect(chooseTechnique({ ...base, distYd: 25, keeperOffLine: 12, keeperGap: 12 }, () => 0.99)).toBe("lob");
    expect(chooseTechnique(base, () => 0)).toBe("placed");
    expect(chooseTechnique({ ...base, distYd: 25 }, () => 0)).toBe("power");
  });

  test("a shot misses by more than a pass of the same distance (base 105 and its speed)", () => {
    const pass = passErrorFactor(0.6, 20, 0.2);
    const shot = shotErrorFactor(0.6, 20, 0.2, 28);
    expect(shot).toBeGreaterThan(pass * 105 / 95);
  });

  test("the error turns the launch, and none leaves it as aimed", () => {
    const v = { vx: 30, vy: 0, vz: 2 };
    expect(applyShotError(v, 1, 0, 0, 0)).toMatchObject({ vx: 30, vy: 0, vz: 2, errDeg: 0 });
    const turned = applyShotError(v, 1, 1, 0, 0);
    expect(turned.vy).toBeGreaterThan(0);
    expect(turned.errDeg).toBeGreaterThan(0);
  });

  test("the aim stays inside the posts and under the bar", () => {
    for (let i = 0; i < 50; i++) {
      const r = i / 50;
      const a = aimPoint({ technique: "power", fromX: 95, fromY: 37, goalX: 115, keeper: { x: 113, y: 37 }, skill: r }, () => r);
      expect(a.y).toBeGreaterThan(GOAL_Y_MIN);
      expect(a.y).toBeLessThan(GOAL_Y_MAX);
      expect(a.z).toBeLessThan(BALL_PHYSICS.CROSSBAR_Z);
    }
  });

  test("a direct launch crosses the aim; a dip clears the obstacle", () => {
    const from = { x: 95, y: 37, z: 0.12 };
    const aim = { x: 115, y: 35, z: 0.5 };
    const v = directLaunch(from, aim, 28);
    expect(fly(from, v, Math.hypot(20, 2))).toBeCloseTo(0.5, 1);
    const dip = dipLaunch(from, { d: 10, z: 2.5 }, { x: 115, y: 37, z: 1.8 })!;
    expect(fly(from, dip, 10)).toBeCloseTo(2.5, 1);
    expect(fly(from, dip, 20)).toBeCloseTo(1.8, 1);
    expect(dipLaunch(from, { d: 25, z: 2 }, aim)).toBeNull();
  });

  test("crossing the line: in, woodwork, wide, over", () => {
    const c = lineCrossing({ x: 114, y: 37, z: 1, vx: 0, vy: 0, vz: 0 }, { x: 116, y: 37, z: 1, vx: 0, vy: 0, vz: 0 }, 115)!;
    expect(c.y).toBeCloseTo(37); expect(c.f).toBeCloseTo(0.5);
    expect(classifyCrossing(37, 1)).toBe("goal");
    expect(classifyCrossing(GOAL_Y_MIN, 1)).toBe("post");
    expect(classifyCrossing(37, BALL_PHYSICS.CROSSBAR_Z)).toBe("bar");
    expect(classifyCrossing(30, 0.5)).toBe("wide");
    expect(classifyCrossing(37, 4)).toBe("over");
  });

  test("a good keeper stops more; a ball at the end of his hands and a fast one are harder", () => {
    const good = { reflex: 0.9, diving: 0.9, positioning: 0.9 };
    const poor = { reflex: 0.2, diving: 0.2, positioning: 0.2 };
    expect(saveChances(good, 0.2, 20).stop).toBeGreaterThan(saveChances(poor, 0.2, 20).stop);
    expect(saveChances(good, 0.9, 20).stop).toBeLessThan(saveChances(good, 0.1, 20).stop);
    expect(saveChances(good, 0.1, 32).stop).toBeLessThan(saveChances(good, 0.1, 18).stop);
    expect(saveChances(good, 0.9, 20).grade).toBe("difficult");
    expect(saveChances(good, 0.1, 15).grade).toBe("routine");
  });

  test("a block mostly rebounds, sums to 1", () => {
    const b = blockChances(0.6, 25);
    expect(b.control + b.deflectOn + b.rebound).toBeCloseTo(1);
    expect(b.rebound).toBeGreaterThan(b.control);
  });
});
