import { describe, expect, test } from "bun:test";
import { croppedPlayerFaceSvg, playerFaceSvg } from "@/Domain/faces/playerFaceSvg";
import { FACE_VERSION, faceUrl } from "@/Domain/faces/faceUrl";
import { faceRegionOf, faceRng, pickFaceRace } from "@/Domain/faces/faceProfile";
import { applyFaceTraits, HAIR_COLORS, HAIR_IDS, SKIN_COLORS } from "@/Domain/faces/faceTraits";

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
    // World data spellings (ESPN/CLDR) that used to fall into "mixed".
    for (const [nat, region] of [
      ["Côte d’Ivoire", "africa"], ["Bosnia & Herzegovina", "europe"], ["Congo - Brazzaville", "africa"],
      ["Congo - Kinshasa", "africa"], ["Trinidad & Tobago", "latinAmerica"],
      ["Palestinian Territories", "northAfricaMiddleEast"], ["Guinea-Bissau", "africa"],
      ["Niger", "africa"], ["Chad", "africa"], ["Sudan", "africa"], ["Martinique", "caribbean"],
      ["Solomon Islands", "pacific"], ["Sri Lanka", "southAsia"],
    ] as const) {
      expect(faceRegionOf(nat), nat).toBe(region);
    }
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

describe("real player traits", () => {
  test("no traits gives the same face as before", () => {
    expect(playerFaceSvg("player_42", "Brazil", ["#DA291C"], undefined)).toBe(playerFaceSvg("player_42", "Brazil", ["#DA291C"]));
    expect(playerFaceSvg("player_42", "Brazil", ["#DA291C"], {})).toBe(playerFaceSvg("player_42", "Brazil", ["#DA291C"]));
  });

  test("skin tone and hair colour override the seeded draw, deterministically", () => {
    const svg = playerFaceSvg("player_42", "England", ["#111111"], { skin: 7, hairColor: "blond" });
    expect(svg).toContain(SKIN_COLORS[7]);
    expect(svg).toContain(HAIR_COLORS.blond);
    expect(svg).toBe(playerFaceSvg("player_42", "England", ["#111111"], { skin: 7, hairColor: "blond" }));
  });

  test("hair length and beard pick ids from their lists", () => {
    const rng = () => 0.5;
    const face = { body: { color: "#000" }, hair: { id: "afro", color: "#000" }, facialHair: { id: "beard1" } };
    applyFaceTraits(face, { hairLength: "short", beard: "none" }, rng);
    expect(HAIR_IDS.short).toContain(face.hair.id);
    expect(face.facialHair.id).toBe("none");
    applyFaceTraits(face, { hairLength: "short" }, rng);
    expect(HAIR_IDS.short).toContain(face.hair.id); // already short: kept
  });
});
