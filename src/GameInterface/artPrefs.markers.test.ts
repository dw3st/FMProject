import { describe, expect, test } from "bun:test";
import { nextMatchMarkers, shownMatchMarkers } from "@/GameInterface/artPrefs";

describe("match markers switch", () => {
  test("with pixel art: figures → pixel → discs → figures", () => {
    expect(nextMatchMarkers("figures", true)).toBe("pixel");
    expect(nextMatchMarkers("pixel", true)).toBe("discs");
    expect(nextMatchMarkers("discs", true)).toBe("figures");
  });

  test("without pixel art: figures ⇄ discs, as before", () => {
    expect(nextMatchMarkers("figures", false)).toBe("discs");
    expect(nextMatchMarkers("discs", false)).toBe("figures");
  });

  test("a saved pixel choice without the atlas shows the figures", () => {
    expect(shownMatchMarkers("pixel", false)).toBe("figures");
    expect(shownMatchMarkers("pixel", true)).toBe("pixel");
    expect(shownMatchMarkers("discs", false)).toBe("discs");
  });
});
