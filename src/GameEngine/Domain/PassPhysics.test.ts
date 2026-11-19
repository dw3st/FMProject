import { describe, expect, test } from "bun:test";
import {
  aerialLaunch, airTime, arrivalLaneScore, buildAerialLaunch, buildGroundLaunch, groundLaunch, landing, launchSpeedYd,
  launchWithError, loftVzYd, passTypeOf, rollTime, vzForPeak, weightedSpeed,
} from "@/GameEngine/Domain/PassPhysics";
import { BALL_PHYSICS } from "@/GameEngine/Configs/BallPhysicsConfig";
import { YD_PER_M_PASS as YD } from "@/GameEngine/Configs/PassPhysicsConfig";
import { apexOf } from "@/GameEngine/Domain/Ball3D";

const env = { rollDecel: 2, bounce: 1 };

describe("physical pass (stage 4)", () => {
  test("FM's launch speed and loft by distance", () => {
    expect(launchSpeedYd(10 * YD) / YD).toBeCloseTo(11.5, 5);
    expect(launchSpeedYd(40 * YD) / YD).toBeCloseTo(25, 5);
    expect(loftVzYd(5 * YD) / YD).toBeCloseTo(0.85, 5);
    expect(loftVzYd(20 * YD) / YD).toBeCloseTo(3.25, 5);
    expect(loftVzYd(100 * YD) / YD).toBeCloseTo(14.3, 5);
    const v = groundLaunch({ x: 0, y: 0 }, { x: 20 * YD, y: 0 });
    expect(Math.hypot(v.vx, v.vy, v.vz) / YD).toBeCloseTo(16, 4);
    expect(v.vy).toBeCloseTo(0, 9);
  });

  test("a high ball peaks at its type's height and lands on the target", () => {
    const z0 = BALL_PHYSICS.FOOT_Z;
    const vz = vzForPeak(z0, 4 * YD);
    expect(apexOf(z0, vz) / YD).toBeCloseTo(4, 4);
    const to = { x: 30 * YD, y: 5 };
    const v = aerialLaunch({ x: 0, y: 0 }, to, z0, vz);
    const land = landing({ x: 0, y: 0, z: z0, ...v }, env)!;
    expect(land.t).toBeCloseTo(airTime(z0, vz), 1);
    expect(Math.hypot(land.x - to.x, land.y - to.y)).toBeLessThan(0.6);
    // FM's |v| for a 30-m cross is 20.5 m/s; the type's height gives one close to it.
    expect(Math.hypot(v.vx, v.vy, v.vz) / YD).toBeGreaterThan(17);
    expect(Math.hypot(v.vx, v.vy, v.vz) / YD).toBeLessThan(22);
  });

  test("the error turns, scales and lifts the vector; zero normals change nothing", () => {
    const v = { vx: 20, vy: 0, vz: 2 };
    expect(launchWithError(v, 1, 0, 0, 0)).toEqual(v);
    const turned = launchWithError(v, 1, 1, 0, 0);
    expect((Math.atan2(turned.vy, turned.vx) * 180) / Math.PI).toBeCloseTo(2.5, 5);
    const faster = launchWithError(v, 1, 0, 1, 0);
    expect(faster.vx).toBeCloseTo(20 * 1.075, 5);
    expect(launchWithError(v, 1, 0, 0, 1).vz).toBeGreaterThan(2);
    expect(launchWithError({ vx: 1, vy: 0, vz: 0 }, 1, 0, 0, -10).vz).toBe(0);
  });

  test("types by kind and launch vz", () => {
    expect(passTypeOf("regular", 0.5 * YD)).toBe("ground");
    expect(passTypeOf("regular", 2 * YD)).toBe("driven");
    expect(passTypeOf("regular", 4 * YD)).toBe("chip");
    expect(passTypeOf("through", 2 * YD)).toBe("through_low");
    expect(passTypeOf("through", 5 * YD)).toBe("through_high");
    expect(passTypeOf("cross", 9, { corner: true })).toBe("corner");
    expect(passTypeOf("long_ball", 9, { lofted: true })).toBe("high");
    expect(passTypeOf("regular", 1, { header: true })).toBe("header");
  });

  test("a ground pass covers its distance about when FM's ball does (0.43 + 0.05·d s)", () => {
    for (const dM of [10, 20]) {
      const b = buildGroundLaunch({ x: 0, y: 0 }, { x: dM * YD, y: 0 }, BALL_PHYSICS.FOOT_Z, env, 0, [0, 0, 0], () => "ground");
      const fm = 0.43 + 0.05 * dM;
      expect(b.launch.T).toBeGreaterThan(fm * 0.6);
      expect(b.launch.T).toBeLessThan(fm * 1.4);
      expect(b.point.x).toBeGreaterThanOrEqual(dM * YD - 0.5);
    }
  });

  test("a through ball is weighted for the runner, never faster than FM's", () => {
    const d = 25;
    const fm = Math.hypot(groundLaunch({ x: 0, y: 0 }, { x: d, y: 0 }).vx, 0);
    expect(weightedSpeed(d, 0.1, 2)).toBeCloseTo(fm, 5);
    const slow = weightedSpeed(d, 3, 2);
    expect(slow).toBeLessThan(fm);
    expect(rollTime(slow, d, 2)).toBeLessThan(3.2);
    expect(weightedSpeed(d, 60, 2)).toBeGreaterThanOrEqual(Math.sqrt(2 * 2 * d));
  });

  test("the lane reads arrival times: clear when nobody gets there in time, blocked by a defender on the path", () => {
    const from = { x: 0, y: 0 }, to = { x: 20, y: 0 };
    expect(arrivalLaneScore(from, to, [{ x: 10, y: 15, speed: 6 }], 2)).toBe(1);
    expect(arrivalLaneScore(from, to, [{ x: 10, y: 0.3, speed: 6 }], 2)).toBe(0);
    const mid = arrivalLaneScore(from, to, [{ x: 12, y: 4, speed: 6 }], 2);
    expect(mid).toBeGreaterThanOrEqual(0);
    expect(mid).toBeLessThan(1);
  });

  test("an aerial launch reports where it really lands", () => {
    const b = buildAerialLaunch({ x: 10, y: 10 }, { x: 50, y: 20 }, BALL_PHYSICS.FOOT_Z, vzForPeak(0.12, 4.8), env, 1, [1, 0, 0], "long");
    expect(b.launch.type).toBe("long");
    expect(Math.hypot(b.point.x - 50, b.point.y - 20)).toBeGreaterThan(0.5);
  });
});
