import { describe, expect, test } from "bun:test";
import {
  PITCH_COLOR,
  colorDistance,
  contrastRatio,
  faceRasterSize,
  markerLabelFontSize,
  needsLightOutline,
  playerMarkerRadius,
} from "@/GraficsEngine/playerFaces";

describe("playerMarkerRadius", () => {
  test("is bigger never below 13 px on any pitch size", () => {
    for (const scale of [2, 4, 6, 7.5, 10, 15]) expect(playerMarkerRadius(scale)).toBeGreaterThanOrEqual(13);
  });

  test("follows the pitch scale between 13 and 24 px", () => {

    expect(playerMarkerRadius(4)).toBe(13);

    expect(playerMarkerRadius(7.56)).toBe(14);

    expect(playerMarkerRadius(10)).toBe(19);

    expect(playerMarkerRadius(12)).toBe(22);

    expect(playerMarkerRadius(30)).toBe(24);

  });



  test("the name label grows slowly with the dot", () => {

    expect(markerLabelFontSize(13)).toBe(10);

    expect(markerLabelFontSize(24)).toBeGreaterThan(markerLabelFontSize(18));

    expect(markerLabelFontSize(24)).toBeLessThanOrEqual(14);

  });
});

describe("faceRasterSize", () => {
  test("rasterises at the marker's device-pixel diameter", () => {
    expect(faceRasterSize(16, 1)).toBe(32);
    expect(faceRasterSize(16, 2)).toBe(64);
    expect(faceRasterSize(16, 0.5)).toBe(32);
  });
});

describe("needsLightOutline", () => {
  test("a dark green kit that blends into the grass gets the light outline", () => {
    expect(needsLightOutline(0x006437)).toBe(true); // Palmeiras-like dark green
    expect(needsLightOutline(0x1e4d2b)).toBe(true);
    expect(needsLightOutline(PITCH_COLOR)).toBe(true);
  });

  test("kits clearly different from the grass keep the dark outline", () => {
    for (const c of [0xda291c, 0x2d6cdf, 0xffffff, 0x000000, 0xffe500, 0x22c55e, 0x6cabdd]) {
      expect(needsLightOutline(c)).toBe(false);
    }
  });

  test("contrast and distance are symmetric and zero/one for identical colours", () => {
    expect(contrastRatio(0x123456, 0x123456)).toBe(1);
    expect(colorDistance(0x123456, 0x123456)).toBe(0);
    expect(contrastRatio(0x000000, 0xffffff)).toBeCloseTo(21, 5);
    expect(colorDistance(0xda291c, PITCH_COLOR)).toBe(colorDistance(PITCH_COLOR, 0xda291c));
  });
});
