import { describe, expect, test } from "bun:test";
import { paintedFaceIdOf } from "@/Domain/faces/faceUrl";

describe("paintedFaceIdOf", () => {
  test("a reborn player or a returned legend keeps the original's face id", () => {
    expect(paintedFaceIdOf("legend_player_3313_2028")).toBe("player_3313");
    expect(paintedFaceIdOf("reborn_of_us_inter_miami_cf_7458500_2029")).toBe("of_us_inter_miami_cf_7458500");
    expect(paintedFaceIdOf("player_3313")).toBe("player_3313");
  });
});
