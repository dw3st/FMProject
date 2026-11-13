import { describe, expect, test } from "bun:test";
import { colorLuma, colorWithAlpha, hexRgb, isDarkPlate, sponsorPlateUrl } from "@/Domain/sponsors/sponsorPlate";

describe("sponsor plate", () => {
  test("a plate URL only for catalog-shaped ids", () => {
    expect(sponsorPlateUrl("sp_norvane_bank")).toBe("/assets/game/v1/sponsors/sp_norvane_bank.webp");
    for (const id of ["", "g0", "sp_", "sp_Upper", "sp_a/b", "../sp_x", "sp_a.webp", `sp_${"a".repeat(81)}`]) expect(sponsorPlateUrl(id)).toBeNull();
  });

  test("colours: rgb, luma, the dark plate, the border colour", () => {
    expect(hexRgb("#FF6D00")).toEqual([255, 109, 0]);
    expect(hexRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexRgb("orange")).toBeNull();
    expect(colorLuma("#000000")).toBe(0);
    expect(Math.round(colorLuma("#ffffff"))).toBe(255);
    expect(isDarkPlate("#111111")).toBe(true);
    expect(isDarkPlate("#0b1f3a")).toBe(true);
    expect(isDarkPlate("#FF6D00")).toBe(false);
    expect(isDarkPlate("not a colour")).toBe(false);
    expect(colorWithAlpha("#ffffff", 0.35)).toBe("rgba(255, 255, 255, 0.35)");
    expect(colorWithAlpha("x", 0.35)).toBeNull();
  });
});
