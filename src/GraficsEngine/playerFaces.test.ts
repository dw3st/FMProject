import { describe, expect, test } from "bun:test";
import { faceRasterSize, playerMarkerRadius } from "@/GraficsEngine/playerFaces";

describe("playerMarkerRadius", () => {
  test("is bigger than the old flat 14 px on every pitch size", () => {
    for (const scale of [2, 4, 6, 7.5, 10, 15]) expect(playerMarkerRadius(scale)).toBeGreaterThan(14);
  });

  test("follows the pitch scale between 16 and 20 px", () => {
    expect(playerMarkerRadius(4)).toBe(16);
    expect(playerMarkerRadius(7.56)).toBe(17);
    expect(playerMarkerRadius(30)).toBe(20);
  });
});

describe("faceRasterSize", () => {
  test("rasterises at the marker's device-pixel diameter", () => {
    expect(faceRasterSize(16, 1)).toBe(32);
    expect(faceRasterSize(16, 2)).toBe(64);
    expect(faceRasterSize(16, 0.5)).toBe(32);
  });
});
