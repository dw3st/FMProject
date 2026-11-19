import { describe, expect, test } from "bun:test";
import { BALL_PHYSICS } from "@/GameEngine/Configs/BallPhysicsConfig";
import { apexOf, landingPoint, launchToward, launchVz, stepFree, stepGuided, type Ball3D, type BallEnv } from "@/GameEngine/Domain/Ball3D";

const env: BallEnv = { rollDecel: 2, bounce: 1 };
const ball = (o: Partial<Ball3D>): Ball3D => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ...o });

describe("stepFree", () => {
  test("a ball on the ground rolls exactly like the loose ball of old", () => {
    const b = stepFree(ball({ x: 10, vx: 4 }), 0.2, env).ball;
    expect(b.x).toBeCloseTo(10 + 4 * 0.2);
    expect(b.vx).toBeCloseTo(4 - 2 * 0.2);
    expect(b.z).toBe(0);
  });

  test("a dropped ball bounces lower each time and settles", () => {
    let b = ball({ z: 3 });
    const peaks: number[] = [];
    let bounces = 0;
    for (let i = 0; i < 40; i++) {
      const st = stepFree(b, 0.1, env);
      bounces += st.bounces;
      if (b.vz > 0 && st.ball.vz <= 0) peaks.push(st.ball.z);
      b = st.ball;
    }
    expect(bounces).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]!).toBeLessThan(peaks[i - 1]!);
    expect(b.z).toBe(0);
    expect(b.vz).toBe(0);
  });

  test("wet grass bounces lower", () => {
    const dry = stepFree(ball({ z: 2 }), 0.7, env).ball.vz;
    const wet = stepFree(ball({ z: 2 }), 0.7, { ...env, bounce: 0.6 }).ball.vz;
    expect(wet).toBeLessThan(dry);
  });
});

describe("launch", () => {
  test("an air launch lands on the target at T, peaking at g·T²/8", () => {
    const T = 1.6;
    const b = launchToward({ x: 0, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }, T, "air", 0);
    expect(apexOf(b.z, b.vz)).toBeCloseTo((BALL_PHYSICS.GRAVITY * T * T) / 8, 3);
    const land = landingPoint(b, env)!;
    expect(land.t).toBeCloseTo(T, 1);
    expect(land.x).toBeCloseTo(40, 0);
  });

  test("launchVz reaches the target height", () => {
    const vz = launchVz(0.1, 2, 0.5);
    const z = 0.1 + vz * 0.5 - 0.5 * BALL_PHYSICS.GRAVITY * 0.25;
    expect(z).toBeCloseTo(2);
  });

  test("a guided ground pass arrives on the target at the end of the time left", () => {
    let b = launchToward({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }, 1, "ground", 2);
    let left = 1;
    for (let i = 0; i < 4; i++) { b = stepGuided(b, { x: 20, y: 0 }, left, 0.2, "ground", env).ball; left -= 0.2; }
    expect(b.x).toBeGreaterThan(14);
    expect(b.x).toBeLessThan(20);
    b = stepGuided(b, { x: 20, y: 0 }, left, 0.2, "ground", env).ball;
    expect(b.x).toBeCloseTo(20);
  });
});
