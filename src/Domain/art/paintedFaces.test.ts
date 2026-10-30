import { afterEach, describe, expect, test } from "bun:test";
import { coachCombo, paintedBackdrop, paintedPlayerStandIn, setPaintedBackdrops, setPaintedFaces } from "@/Domain/art/paintedFaces";
import { faceUrl, managerAvatarUrl, refereeFaceUrl } from "@/Domain/faces/faceUrl";

afterEach(() => { setPaintedFaces(null); setPaintedBackdrops(null); });

describe("painted faces", () => {
  test("a player with a painted face gets the webp; one without keeps the SVG", () => {
    setPaintedFaces({ players: ["es_104943"], coaches: [], referees: [] });
    expect(faceUrl("es_104943", "Brazil", ["#fff"])).toBe("/assets/art/v2/faces/players/es_104943.webp");
    expect(faceUrl("player_1")).toStartWith("/api/faces/player_1.svg?");
  });

  test("nothing announced (art off): every face stays the SVG", () => {
    expect(faceUrl("es_104943")).toStartWith("/api/faces/es_104943.svg?");
    expect(refereeFaceUrl("ref_Q1")).toStartWith("/api/faces/person/ref_Q1.svg?");
  });

  test("referees and the human manager's full combination", () => {
    setPaintedFaces({ players: [], coaches: ["1-black-bald-full-g"], referees: ["ref_Q1"] });
    expect(refereeFaceUrl("ref_Q1", "Spain", 40, true)).toBe("/assets/art/v2/faces/referees/ref_Q1.webp");
    const face = { seed: 1, skin: 1, hairColor: "black", hairLength: "bald", beard: "full", glasses: true } as const;
    expect(managerAvatarUrl(face)).toBe("/assets/art/v2/faces/coaches/1-black-bald-full-g.webp");
    // A trait left to the draw: no painted combination, the SVG avatar.
    expect(coachCombo({ seed: 1, skin: 1, hairColor: "black", hairLength: "bald", beard: "full" })).toBeNull();
    expect(managerAvatarUrl({ seed: 1, skin: 2 })).toStartWith("/api/faces/manager/avatar.svg?");
  });

  test("a backdrop is served only when announced", () => {
    expect(paintedBackdrop("match-backdrop-grass-a")).toBeNull();
    setPaintedBackdrops(["match-backdrop-grass-a"]);
    expect(paintedBackdrop("match-backdrop-grass-a")).toBe("/assets/art/v2/backdrops/match/match-backdrop-grass-a.webp");
  });
});

describe("player stand-in faces", () => {
  test("a player without a portrait gets a painted face of his skin tone, young-looking", () => {
    setPaintedFaces({ players: [], coaches: ["2-brown-short-none-n", "2-grey-short-none-n", "2-black-short-none-g", "3-black-short-none-n"], referees: [] });
    expect(paintedPlayerStandIn("x1", 2)).toBe("/assets/art/v2/faces/coaches/2-brown-short-none-n.webp");
    expect(paintedPlayerStandIn("x1", 7)).toBeNull();
    setPaintedFaces(null);
    expect(paintedPlayerStandIn("x1", 2)).toBeNull();
  });
});
