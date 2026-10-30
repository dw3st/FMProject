import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setNewVisual, setPaintedBackdrops } from "@/Domain/art/paintedFaces";
import { PLAIN_GRASS, paintedSurfaceOf } from "@/GameInterface/Components/PitchSurfaceSvg";
import { PAINTED_STADIUM } from "@/GameInterface/Facilities/FacilitiesView";
import { GAME_ART_FILES } from "@/backend/staticAssets";

describe("club screen art", () => {
  afterEach(() => { setNewVisual(false); setPaintedBackdrops(null); });

  test("the painted stadium and the plain grass are whitelisted and in the repo", () => {
    for (const path of [PAINTED_STADIUM, PLAIN_GRASS]) {
      expect(GAME_ART_FILES[path]).toBe("image/webp");
      expect(existsSync(join(import.meta.dir, "..", "..", "example_data", "assets", path))).toBe(true);
    }
  });

  test("no painted turf without the new visual", () => {
    setPaintedBackdrops(["match-backdrop-mow-check"]);
    expect(paintedSurfaceOf({ condition: 95, turf: "natural", mowing: "checker", seed: "x" })).toBeNull();
  });

  test("the turf preview uses the match backdrop of the turf and mowing", () => {
    setNewVisual(true);
    setPaintedBackdrops(["match-backdrop-mow-check", "match-backdrop-synthetic"]);
    expect(paintedSurfaceOf({ condition: 95, turf: "natural", mowing: "checker", seed: "x" }))
      .toEqual({ kind: "backdrop", url: expect.stringContaining("match-backdrop-mow-check.webp") });
    expect(paintedSurfaceOf({ condition: 95, turf: "synthetic", mowing: "stripes", seed: "x" })?.url)
      .toContain("match-backdrop-synthetic");
    // A backdrop not on the server: the drawn surface.
    expect(paintedSurfaceOf({ condition: 95, turf: "natural", mowing: "diagonal", seed: "x" })).toBeNull();
  });

  test("an unmown pitch uses the plain grass texture", () => {
    setNewVisual(true);
    setPaintedBackdrops([]);
    expect(paintedSurfaceOf({ condition: 95, turf: "natural", mowing: "none", seed: "x" }))
      .toEqual({ kind: "plain", url: expect.stringContaining(PLAIN_GRASS) });
  });
});
