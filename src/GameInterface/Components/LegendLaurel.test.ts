import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { GAME_ART_FILES } from "@/backend/staticAssets";
import { LEGEND_LAUREL_FILE } from "@/GameInterface/Components/LegendLaurel";

describe("legend laurel", () => {
  test("the wreath is served and exists in the repository", () => {
    expect(GAME_ART_FILES[LEGEND_LAUREL_FILE]).toBe("image/png");
    expect(existsSync(`src/example_data/assets/${LEGEND_LAUREL_FILE}`)).toBe(true);
  });
});
