import { describe, expect, test } from "bun:test";
import { particleAt, weatherParticles } from "@/GraficsEngine/weatherParticles";

describe("weatherParticles", () => {
  test("rain 150, snow 100, none otherwise; deterministic", () => {
    expect(weatherParticles("rain", "s")).toHaveLength(150);
    expect(weatherParticles("snow", "s")).toHaveLength(100);
    expect(weatherParticles("sunny", "s")).toHaveLength(0);
    expect(weatherParticles("rain", "s")).toEqual(weatherParticles("rain", "s"));
  });

  test("particleAt stays inside 0..1 and moves with time", () => {
    const p = weatherParticles("rain", "s")[0]!;
    for (const t of [0, 0.4, 3.7, 120]) {
      const q = particleAt(p, t);
      expect(q.x).toBeGreaterThanOrEqual(0); expect(q.x).toBeLessThan(1);
      expect(q.y).toBeGreaterThanOrEqual(0); expect(q.y).toBeLessThan(1);
    }
    expect(particleAt(p, 0.1)).not.toEqual(particleAt(p, 0));
  });
});
