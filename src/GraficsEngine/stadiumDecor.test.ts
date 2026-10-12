import { describe, expect, test } from "bun:test";
import { decorRects } from "@/GraficsEngine/stadiumDecor";
import { standSideRects } from "@/GraficsEngine/crowd";
import type { StandGeometry } from "@/GraficsEngine/pitchMetrics";

const stand = { outer: { x: 0, y: 0, w: 600, h: 400 }, inner: { x: 40, y: 30, w: 520, h: 340 } } as StandGeometry;

describe("stadium decorations", () => {
  test("nothing without a decoration", () => {
    expect(decorRects(stand, "left", { banner: false, flag: false, mosaic: false })).toEqual([]);
  });

  test("every piece inside the home end, the banner along the pitch edge", () => {
    for (const side of ["left", "right"] as const) {
      const end = standSideRects(stand).find((r) => r.side === side)!;
      const rects = decorRects(stand, side, { banner: true, flag: true, mosaic: true });
      expect(rects.length).toBeGreaterThan(8);
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(end.x - 1e-9);
        expect(r.x + r.w).toBeLessThanOrEqual(end.x + end.w + 1e-9);
        expect(r.y).toBeGreaterThanOrEqual(end.y - 1e-9);
        expect(r.y + r.h).toBeLessThanOrEqual(end.y + end.h + 1e-9);
      }
      const banner = decorRects(stand, side, { banner: true, flag: false, mosaic: false })[0]!;
      if (side === "left") expect(banner.x + banner.w).toBeCloseTo(end.x + end.w);
      else expect(banner.x).toBeCloseTo(end.x);
    }
  });
});
