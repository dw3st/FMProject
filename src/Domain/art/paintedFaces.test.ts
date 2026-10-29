import { afterEach, describe, expect, test } from "bun:test";
import { coachCombo, setPaintedFaces } from "@/Domain/art/paintedFaces";
import { faceUrl, managerAvatarUrl, refereeFaceUrl } from "@/Domain/faces/faceUrl";

afterEach(() => setPaintedFaces(null));

describe("painted faces", () => {
  test("a player with a painted face gets the webp; one without keeps the SVG", () => {
    setPaintedFaces({ players: ["es_104943"], coaches: [], referees: [] });
    expect(faceUrl("es_104943", "Brazil", ["#fff"])).toBe("/assets/art/v1/faces/players/es_104943.webp");
    expect(faceUrl("player_1")).toStartWith("/api/faces/player_1.svg?");
  });

  test("nothing announced (art off): every face stays the SVG", () => {
    expect(faceUrl("es_104943")).toStartWith("/api/faces/es_104943.svg?");
    expect(refereeFaceUrl("ref_Q1")).toStartWith("/api/faces/person/ref_Q1.svg?");
  });

  test("referees and the human manager's full combination", () => {
    setPaintedFaces({ players: [], coaches: ["1-black-bald-full-g"], referees: ["ref_Q1"] });
    expect(refereeFaceUrl("ref_Q1", "Spain", 40, true)).toBe("/assets/art/v1/faces/referees/ref_Q1.webp");
    const face = { seed: 1, skin: 1, hairColor: "black", hairLength: "bald", beard: "full", glasses: true } as const;
    expect(managerAvatarUrl(face)).toBe("/assets/art/v1/faces/coaches/1-black-bald-full-g.webp");
    // A trait left to the draw: no painted combination, the SVG avatar.
    expect(coachCombo({ seed: 1, skin: 1, hairColor: "black", hairLength: "bald", beard: "full" })).toBeNull();
    expect(managerAvatarUrl({ seed: 1, skin: 2 })).toStartWith("/api/faces/manager/avatar.svg?");
  });
});
