import { describe, expect, test } from "bun:test";
import { KINEMATICS_CONFIG } from "@/GameEngine/Configs/KinematicsConfig";
import { accelAt, carryAccel, etaTo, stepAlong, stepToward, timeToCover, turnFactor } from "@/GameEngine/Domain/Kinematics";

const cfg = { ...KINEMATICS_CONFIG, ENABLED: true };
const dt = 0.2;

describe("acceleration law", () => {
  test("8 m/s² from standstill for a full acceleration attribute, zero near 11.87 yd/s", () => {
    expect(accelAt(0, 1, cfg)).toBeCloseTo(8.749, 3);
    expect(accelAt(0, 0.5, cfg)).toBeCloseTo(8.749 * 0.75, 3);
    expect(accelAt(11.87, 1, cfg)).toBe(cfg.ACCEL_MIN);
  });

  test("a carrier accelerates slower than a runner", () => {
    expect(carryAccel(8, 0.5, cfg)).toBeLessThan(accelAt(0, 0.5, cfg));
    expect(carryAccel(8, 1, cfg)).toBeGreaterThan(carryAccel(8, 0, cfg));
  });
});

describe("stepToward", () => {
  test("a sprint from standstill builds up to the top speed and keeps it", () => {
    let b = { x: 0, y: 0, vx: 0, vy: 0, accel: 0.5 };
    const speeds: number[] = [];
    for (let i = 0; i < 20; i++) {
      const s = stepToward(b, 100, 0, 8, dt, {}, cfg);
      speeds.push(s.speed);
      b = { ...b, x: s.x, y: s.y, vx: s.vx, vy: s.vy };
    }
    expect(speeds[0]).toBeCloseTo(accelAt(0, 0.5, cfg) * dt, 6);
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]!).toBeGreaterThanOrEqual(speeds[i - 1]!);
    expect(speeds.at(-1)).toBeCloseTo(8, 6);
  });

  test("a short run never reaches top speed", () => {
    let b = { x: 0, y: 0, vx: 0, vy: 0, accel: 0.5 };
    let top = 0;
    for (let i = 0; i < 20; i++) {
      const s = stepToward(b, 4, 0, 9, dt, {}, cfg);
      top = Math.max(top, s.speed);
      b = { ...b, x: s.x, y: s.y, vx: s.vx, vy: s.vy };
    }
    expect(top).toBeLessThan(6);
    expect(b.x).toBeCloseTo(4, 6);
  });

  test("arrives without overshooting and stops", () => {
    let b = { x: 0, y: 0, vx: 8, vy: 0, accel: 0.5 };
    for (let i = 0; i < 30; i++) {
      const s = stepToward(b, 6, 0, 8, dt, {}, cfg);
      expect(s.x).toBeLessThanOrEqual(6 + 1e-9);
      b = { ...b, x: s.x, y: s.y, vx: s.vx, vy: s.vy };
    }
    expect(b.x).toBeCloseTo(6, 6);
    expect(Math.hypot(b.vx, b.vy)).toBe(0);
  });

  test("a sharp turn cuts top speed", () => {
    const s = stepToward({ x: 0, y: 0, vx: 8, vy: 0, accel: 0.5 }, 0, 30, 8, dt, {}, cfg);
    expect(s.turn).toBeCloseTo(0.55, 6);
    expect(s.speed).toBeCloseTo(8 * 0.55, 6);
    expect(turnFactor(15, cfg)).toBe(1);
    expect(turnFactor(180, cfg)).toBeCloseTo(0.4, 6);
  });

  test("braking to a lower top speed, dropping at once when beaten", () => {
    const braking = stepToward({ x: 0, y: 0, vx: 9, vy: 0, accel: 0.5 }, 100, 0, 3, dt, {}, cfg);
    expect(braking.speed).toBeCloseTo(9 - cfg.BRAKE * dt, 6);
    const beaten = stepToward({ x: 0, y: 0, vx: 9, vy: 0, accel: 0.5 }, 100, 0, 3, dt, { dropToTop: true }, cfg);
    expect(beaten.speed).toBe(3);
  });
});

describe("stepAlong (carrier)", () => {
  test("no arrival, carrier accel", () => {
    const s = stepAlong({ x: 0, y: 0, vx: 0, vy: 0, accel: 1 }, 1, 0, 8, dt, { carryDribbling: 0.5 }, cfg);
    expect(s.speed).toBeCloseTo(carryAccel(8, 0.5, cfg) * dt, 6);
  });
});

describe("race estimates", () => {
  test("timeToCover", () => {
    expect(timeToCover(10, 8, 8, 5)).toBeCloseTo(10 / 8, 9);
    expect(timeToCover(1, 0, 8, 2)).toBeCloseTo(1, 9);
    expect(timeToCover(20, 0, 8, 8)).toBeCloseTo(1 + 16 / 8, 9);
  });

  test("velocity toward the point shortens the ETA; layer off = dist / vTop", () => {
    const moving = etaTo({ x: 0, y: 0, vel: { x: 8, y: 0 }, kin: { x: 0, y: 0 } }, 0.5, 20, 0, 20, 8, cfg);
    const standing = etaTo({ x: 0, y: 0 }, 0.5, 20, 0, 20, 8, cfg);
    expect(moving).toBeLessThan(standing);
    expect(moving).toBeCloseTo(20 / 8, 9);
    expect(etaTo({ x: 0, y: 0 }, 0.5, 20, 0, 20, 8, { ...cfg, ENABLED: false })).toBe(20 / 8);
  });
});
