import { describe, expect, test } from "bun:test";
import { kitDotStyle, readableOnDark, relativeLuminance } from "@/GameInterface/matchTeamColors";

describe("readableOnDark", () => {
  test("lifts black and other dark kits to a readable luminance", () => {
    for (const hex of ["#000000", "#111111", "#1a1a2e", "#5c0a0a", "#001f5b"]) {
      const out = readableOnDark(hex);
      expect(relativeLuminance(out)).toBeGreaterThanOrEqual(0.2);
      expect(out).not.toBe("#ffffff");
    }
  });

  test("keeps light and saturated kits unchanged", () => {
    for (const hex of ["#ffffff", "#ffd700", "#22c55e", "#ef4444"]) {
      expect(readableOnDark(hex)).toBe(hex);
    }
  });
});

describe("kitDotStyle", () => {
  test("rings dark kits so the dot shows on the dark background", () => {
    for (const hex of ["#000000", "#111111", "#001f5b"]) {
      expect(kitDotStyle(hex).boxShadow).toBeDefined();
      expect(kitDotStyle(hex).background).toBe(hex);
    }
  });

  test("leaves visible kits as a plain dot", () => {
    for (const hex of ["#ffffff", "#ffd700", "#22c55e", "#ef4444"]) {
      expect(kitDotStyle(hex)).toEqual({ background: hex });
    }
  });
});
