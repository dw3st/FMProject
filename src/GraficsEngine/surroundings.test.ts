import { describe, expect, test } from "bun:test";
import { buildMetrics } from "@/GraficsEngine/pitchMetrics";
import { standFootprint } from "@/GraficsEngine/stadiumExtras";
import { inFootprint, insidePoly, surroundLayout } from "@/GraficsEngine/surroundings";

describe("surroundings", () => {
  const m = buildMetrics(1100, 700, { stadium: true, shape: "oval" });
  const canvas = { w: 1100, h: 700 };

  test("point in polygon", () => {
    const sq = [0, 0, 10, 0, 10, 10, 0, 10];
    expect(insidePoly(sq, 5, 5)).toBe(true);
    expect(insidePoly(sq, 15, 5)).toBe(false);
  });

  test("trees and beds lie outside the stadium, the same for the same stadium", () => {
    const a = surroundLayout(canvas, m.stand!, m.scale, "std_x");
    const b = surroundLayout(canvas, m.stand!, m.scale, "std_x");
    expect(a).toEqual(b);
    expect(a.trees.length).toBeGreaterThan(10);
    const polys = standFootprint(m.stand!);
    for (const t of a.trees) expect(inFootprint(polys, t.x, t.y)).toBe(false);
    for (const bed of a.beds) expect(inFootprint(polys, bed.x + bed.w / 2, bed.y + bed.h / 2)).toBe(false);
    expect(surroundLayout(canvas, m.stand!, m.scale, "std_y").trees).not.toEqual(a.trees);
  });

  test("a blocks ground has trees in its open corners", () => {
    const mb = buildMetrics(1100, 700, { stadium: true, shape: "blocks" });
    const s = mb.stand!;
    const { trees } = surroundLayout(canvas, s, mb.scale, "std_small");
    const inCorner = trees.some((t) => t.x > s.outer.x && t.x < s.inner.x && t.y > s.outer.y && t.y < s.inner.y)
      || trees.some((t) => t.x > s.inner.x + s.inner.w && t.y > s.inner.y + s.inner.h && t.x < s.outer.x + s.outer.w);
    expect(inCorner).toBe(true);
  });
});
