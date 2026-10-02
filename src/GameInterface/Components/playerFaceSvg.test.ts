import { describe, expect, test } from "bun:test";
import { playerFaceSvg } from "@/GameInterface/Components/playerFaceSvg";
import { faceRegionOf, faceRng, pickFaceRace } from "@/Domain/faces/faceProfile";

describe("player faces", () => {
  test("same id, nationality and colours give the same SVG", () => {
    const a = playerFaceSvg("player_42", "Brazil", ["#DA291C", "#FFE500"]);
    const b = playerFaceSvg("player_42", "Brazil", ["#DA291C", "#FFE500"]);
    expect(a).toBe(b);
    expect(a.startsWith("<svg")).toBe(true);
  });

  test("different ids give different faces", () => {
    const faces = new Set(["a", "b", "c", "d", "e"].map((id) => playerFaceSvg(id, "England", ["#111111", "#eeeeee"])));
    expect(faces.size).toBe(5);
  });

  test("the jersey uses the club colours", () => {
    expect(playerFaceSvg("player_7", "Italy", ["#123456", "#abcdef"]).toLowerCase()).toContain("#123456");
  });

  test("generation does not leave Math.random patched", () => {
    const before = Math.random;
    playerFaceSvg("player_9", "Japan", undefined);
    expect(Math.random).toBe(before);
  });

  test("appearance mix comes from the nationality region, unknown is mixed", () => {
    expect(faceRegionOf("Nigeria")).toBe("africa");
    expect(faceRegionOf("Japan")).toBe("eastAsia");
    expect(faceRegionOf(undefined)).toBe("mixed");
    const rng = faceRng("x");
    const races = new Set(Array.from({ length: 400 }, () => pickFaceRace("England", rng)));
    expect(races.size).toBeGreaterThan(2); // broad, never a single fixed look
  });
});
