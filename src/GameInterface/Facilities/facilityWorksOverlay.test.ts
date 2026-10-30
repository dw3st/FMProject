import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setNewVisual } from "@/Domain/art/paintedFaces";
import { facilityWorksOverlay } from "@/GameInterface/Facilities/FacilityItemArt";
import { GAME_ART_FILES } from "@/backend/staticAssets";

describe("facilityWorksOverlay", () => {
  afterEach(() => setNewVisual(false));

  test("no overlay without the new visual", () => {
    setNewVisual(false);
    expect(facilityWorksOverlay("stadiumStructure")).toBeNull();
  });

  test("indoor items get the indoor overlay, the rest the outdoor one", () => {
    setNewVisual(true);
    expect(facilityWorksOverlay("gym")).toContain("facilities-works/works-indoor.webp");
    expect(facilityWorksOverlay("canteen")).toContain("works-indoor");
    expect(facilityWorksOverlay("stadiumPitch")).toContain("facilities-works/works-outdoor.webp");
    expect(facilityWorksOverlay("academyLodging")).toContain("works-outdoor");
  });

  test("both overlays are whitelisted and in the repo", () => {
    for (const kind of ["outdoor", "indoor"]) {
      const path = `facilities-works/works-${kind}.webp`;
      expect(GAME_ART_FILES[path]).toBe("image/webp");
      expect(existsSync(join(import.meta.dir, "..", "..", "example_data", "assets", path))).toBe(true);
    }
  });
});
