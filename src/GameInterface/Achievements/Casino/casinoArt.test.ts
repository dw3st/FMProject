import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { GAME_ART_FILES } from "@/backend/staticAssets";
import { CLASSIC_STRIP } from "@/Domain/casino/classicSlot";
import { STADIUM_SYMBOLS } from "@/Domain/casino/stadiumSlot";
import { casinoArtPath } from "@/GameInterface/Achievements/Casino/CasinoSymbols";

const names = [...new Set(CLASSIC_STRIP.filter((s) => s !== "blank")), ...STADIUM_SYMBOLS, "plane"];

describe("casino painted symbols", () => {
  test("every painted symbol is served and committed", () => {
    for (const name of names) {
      const path = casinoArtPath(name);
      expect(GAME_ART_FILES[path]).toBe("image/webp");
      expect(existsSync(join(import.meta.dir, "..", "..", "..", "example_data", "assets", path))).toBe(true);
    }
  });
});
