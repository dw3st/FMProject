import { describe, expect, test } from "bun:test";
import { croppedPlayerFaceSvg, playerFaceSvg } from "@/Domain/faces/playerFaceSvg";
import { FACE_VERSION, faceUrl } from "@/Domain/faces/faceUrl";
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

describe("cropped face + url", () => {
  test("crop is a square, sized viewBox over the same face", () => {
    const svg = croppedPlayerFaceSvg("player_42", "Brazil", ["#DA291C", "#FFE500"]);
    expect(svg).toContain('viewBox="-80 40 560 560"');
    expect(svg).toContain('width="560" height="560"');
    expect(svg).toContain('preserveAspectRatio="xMidYMin slice"');
    expect(svg).toBe(croppedPlayerFaceSvg("player_42", "Brazil", ["#DA291C", "#FFE500"]));
  });

  test("faceUrl carries version, nationality and colours without '#'", () => {
    const url = faceUrl("player_42", "Côte d'Ivoire", ["#DA291C", "#FFE500"]);
    expect(url.startsWith("/api/faces/player_42.svg?")).toBe(true);
    const q = new URL(url, "http://x").searchParams;
    expect(q.get("v")).toBe(String(FACE_VERSION));
    expect(q.get("nat")).toBe("Côte d'Ivoire");
    expect(q.get("colors")).toBe("DA291C,FFE500");
    expect(faceUrl("p", null, undefined)).toBe(`/api/faces/p.svg?v=${FACE_VERSION}`);
  });
});
