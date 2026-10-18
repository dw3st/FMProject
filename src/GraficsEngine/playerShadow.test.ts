import { describe, expect, test } from "bun:test";
import { shadowPolygons } from "@/GraficsEngine/playerShadow";

const cast = { kind: "cast" as const, angle: Math.PI / 2, length: 0.4, width: 1.0, tip: 0.8, alpha: 0.6 };
const ys = (polys: ReturnType<typeof shadowPolygons>) => polys.flatMap((p) => p.points.filter((_, i) => i % 2 === 1));
const xs = (polys: ReturnType<typeof shadowPolygons>) => polys.flatMap((p) => p.points.filter((_, i) => i % 2 === 0));

describe("shadowPolygons", () => {
  test("a light shadow is a round oval under the player, nudged along its angle", () => {
    const core = shadowPolygons(cast, false)[0]!;
    const y = core.points.filter((_, i) => i % 2 === 1), x = core.points.filter((_, i) => i % 2 === 0);
    // Centre 0.4 down (+y), radius 1.0 along y and 0.8 across.
    expect((Math.max(...y) + Math.min(...y)) / 2).toBeCloseTo(0.4, 5);
    expect(Math.max(...y) - Math.min(...y)).toBeCloseTo(2.0, 1);
    expect(Math.max(...x) - Math.min(...x)).toBeCloseTo(1.6, 1);
    // It covers the marker centre: the shadow is under the player, not a stripe beside him.
    expect(Math.min(...y)).toBeLessThan(0);
  });

  test("soft passes: larger and fainter, summing to the shadow's alpha", () => {
    const polys = shadowPolygons(cast, false);
    expect(polys.reduce((n, p) => n + p.alpha, 0)).toBeCloseTo(0.6, 5);
    for (let i = 1; i < polys.length; i++) expect(polys[i]!.alpha).toBeLessThan(polys[i - 1]!.alpha);
    expect(Math.max(...ys(polys))).toBeLessThan(0.4 + 1.0 * 1.5 + 1e-9);
  });

  test("mirror turns it 180°; contact sits under the feet", () => {
    const m = shadowPolygons(cast, true);
    expect((Math.max(...ys(m)) + Math.min(...ys(m))) / 2).toBeCloseTo(-0.4, 5);
    expect(Math.abs((Math.max(...xs(m)) + Math.min(...xs(m))) / 2)).toBeLessThan(1e-9);
    const contact = shadowPolygons({ kind: "contact", angle: Math.PI / 2, length: 0.4, width: 0.7, tip: 0.5, alpha: 0.5 }, false);
    const cy = contact[0]!.points.filter((_, i) => i % 2 === 1);
    expect((Math.max(...cy) + Math.min(...cy)) / 2).toBeCloseTo(0.4, 5);
  });
});
