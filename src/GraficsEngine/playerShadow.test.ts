import { describe, expect, test } from "bun:test";
import { shadowPolygons } from "@/GraficsEngine/playerShadow";

const cast = { kind: "cast" as const, angle: Math.PI / 2, length: 2, width: 0.5, tip: 0.2, alpha: 0.6 };

describe("shadowPolygons", () => {
  test("a cast shadow points along its angle, no farther than its length plus the soft margin", () => {
    const polys = shadowPolygons(cast, false);
    const ys = polys.flatMap((p) => p.points.filter((_, i) => i % 2 === 1));
    expect(Math.max(...ys)).toBeGreaterThan(1.9);
    expect(Math.max(...ys)).toBeLessThan(2 + 0.2 * 1.5 + 1e-9);
    expect(Math.min(...ys)).toBeGreaterThan(-1e-9);
  });

  test("it fades toward the tip and the soft passes sum to the shadow's alpha at the feet", () => {
    const polys = shadowPolygons(cast, false);
    const first = polys[0]!, lastCore = polys[4]!;
    expect(lastCore.alpha).toBeLessThan(first.alpha);
    const feet = polys.filter((_, i) => i % 5 === 0).reduce((n, p) => n + p.alpha, 0);
    expect(feet).toBeCloseTo(0.6 * (1 - 0.7 * 0.1), 5);
  });

  test("mirror turns the shadow 180°; contact sits under the feet", () => {
    const ys = shadowPolygons(cast, true).flatMap((p) => p.points.filter((_, i) => i % 2 === 1));
    expect(Math.min(...ys)).toBeLessThan(-1.9);
    const contact = shadowPolygons({ kind: "contact", angle: Math.PI / 2, length: 0.4, width: 0.7, tip: 0.5, alpha: 0.5 }, false);
    const cy = contact[0]!.points.filter((_, i) => i % 2 === 1);
    expect((Math.max(...cy) + Math.min(...cy)) / 2).toBeCloseTo(0.4, 5);
  });
});
