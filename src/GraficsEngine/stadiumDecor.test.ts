import { describe, expect, test } from "bun:test";
import { decorFill, decorRects, mosaicCells } from "@/GraficsEngine/stadiumDecor";
import { DECOR_LIGHT, decorColors, parseDecorStyle } from "@/Domain/achievements/decorStyle";
import { standSideRects } from "@/GraficsEngine/crowd";
import type { StandGeometry } from "@/GraficsEngine/pitchMetrics";

const stand = { outer: { x: 0, y: 0, w: 600, h: 400 }, inner: { x: 40, y: 30, w: 520, h: 340 } } as StandGeometry;

describe("stadium decorations", () => {
  test("nothing without a decoration", () => {
    expect(decorRects(stand, "left", { banner: false, flag: false, mosaic: false })).toEqual([]);
    // the giant flag is not drawn (4.41.18)
    expect(decorRects(stand, "left", { banner: false, flag: true, mosaic: false })).toEqual([]);
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

describe("decor colours and pixel-art mosaic (8.9.10)", () => {
  const side = { side: "left" as const, x: 0, y: 0, w: 160, h: 400 };
  test("palettes: club, inverted, ready pairs and two chosen colours", () => {
    expect(decorColors({}, "#c8102e")).toEqual(["#c8102e", DECOR_LIGHT]);
    expect(decorColors({ palette: "inverted" }, "#c8102e")).toEqual([DECOR_LIGHT, "#c8102e"]);
    expect(decorColors({ palette: "custom", colors: ["#000000", "#ffffff"] }, "#c8102e")).toEqual(["#000000", "#ffffff"]);
  });
  test("the style fields are checked", () => {
    expect(parseDecorStyle({ palette: "black_gold", pattern: "star" })).toEqual({ palette: "black_gold", pattern: "star" });
    expect(() => parseDecorStyle({ palette: "pink" })).toThrow("invalidDecor");
    expect(() => parseDecorStyle({ palette: "custom" })).toThrow("invalidDecor");
    expect(() => parseDecorStyle({ colors: ["red", "#fff"] })).toThrow("invalidDecor");
  });
  test("square cells cover the end stand; the star and the crest use the second colour", () => {
    const cells = mosaicCells(side, { pattern: "stripes" });
    expect(cells.length).toBe(16 * 40);
    expect(new Set(cells.map((c) => c.tone))).toEqual(new Set(["main", "second"]));
    const star = mosaicCells(side, { pattern: "star" });
    expect(star.some((c) => c.tone === "second")).toBe(true);
  });
  test("the crest mosaic takes the crest's pixels; transparent ones are the main colour", () => {
    const size = 2;
    const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0]);
    const cells = mosaicCells(side, { pattern: "crest" }, { size, data });
    expect(cells.some((c) => c.rgb === 0xff0000)).toBe(true);
    expect(cells.some((c) => c.rgb === 0x0000ff)).toBe(true);
    expect(decorFill(cells.find((c) => c.rgb === undefined)!, [0x111111, 0x222222])).toBe(0x111111);
  });
});
