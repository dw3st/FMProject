import { describe, expect, test } from "bun:test";
import { DECOR_ITEMS, MOSAIC_ART, bannerAllowed, decorRefusal, decorValue, mosaicAllowed, ownsKind, patternCell, titlesArt } from "@/Domain/achievements/decorShop";
import { parseDecor } from "@/Domain/achievements/items";
import { emptyAchievements } from "@/Domain/achievements/progress";
import { decorRects, mosaicCells } from "@/GraficsEngine/stadiumDecor";
import { standSideRects } from "@/GraficsEngine/crowd";
import type { StandGeometry } from "@/GraficsEngine/pitchMetrics";

const stand = { outer: { x: 0, y: 0, w: 600, h: 400 }, inner: { x: 40, y: 30, w: 520, h: 340 } } as StandGeometry;

describe("stadium decor shop (9.1)", () => {
  test("refusal, value and what is allowed", () => {
    expect(decorRefusal([], "heart", 10)).toBe("noMoney");
    expect(decorRefusal([], "heart", DECOR_ITEMS.heart.price)).toBeNull();
    expect(decorRefusal(["heart"], "heart", 1e12)).toBe("owned");
    expect(decorValue(["heart", "lion", "junk"])).toBe(DECOR_ITEMS.heart.price + DECOR_ITEMS.lion.price);
    expect(mosaicAllowed("stripes", [])).toBe(true);
    expect(mosaicAllowed("lion", [])).toBe(false);
    expect(mosaicAllowed("lion", ["lion"])).toBe(true);
    expect(bannerAllowed("plain", [])).toBe(true);
    expect(bannerAllowed("check", [])).toBe(false);
    expect(bannerAllowed("check", ["bannerCheck"])).toBe(true);
    expect(ownsKind(["flares"], "mosaic")).toBe(false);
    expect(ownsKind(["crown"], "mosaic")).toBe(true);
  });

  test("every pixel-art row has the same width", () => {
    for (const art of Object.values(MOSAIC_ART)) {
      const w = art![0]!.length;
      for (const row of art!) expect(row.length).toBe(w);
    }
    expect(patternCell("diagonal", 0, 0, 8)).not.toBeNull();
    expect(patternCell("stripes", 0, 0, 8)).toBeNull();
    expect(titlesArt(["###"], 2)[0]).toContain("#");
    expect(titlesArt(["###"], 0)).toEqual(["###"]);
  });

  test("a bought mosaic opens even without the achievement points; one not bought is locked", () => {
    const state = emptyAchievements();
    expect(() => parseDecor({ banner: false, flag: false, mosaic: true, pattern: "lion" }, state, [])).toThrow();
    const ok = parseDecor({ banner: false, flag: false, mosaic: true, pattern: "lion" }, state, ["lion"]);
    expect(ok.pattern).toBe("lion");
  });

  test("bought mosaics draw inside the home end; doubleEnd also on the away end", () => {
    const end = standSideRects(stand).find((r) => r.side === "left")!;
    for (const pattern of ["heart", "lion", "diagonal", "waves", "diamonds", "titles"] as const) {
      const cells = mosaicCells(end, { pattern, titleStars: 3 });
      expect(cells.length).toBeGreaterThan(8);
    }
    const one = decorRects(stand, "left", { banner: false, flag: false, mosaic: true, pattern: "crown" });
    const two = decorRects(stand, "left", { banner: false, flag: false, mosaic: true, pattern: "crown", owned: ["doubleEnd"] });
    expect(two.length).toBeGreaterThan(one.length);
  });
});
