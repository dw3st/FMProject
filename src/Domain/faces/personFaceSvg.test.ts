import { describe, expect, test } from "bun:test";
import { ageFace, croppedPersonFaceSvg, personFaceSvg } from "@/Domain/faces/personFaceSvg";
import {
  managerFaceQuery,
  parseManagerFace,
  parseManagerFaceQuery,
  randomFaceSeed,
  MAX_FACE_SEED,
  type ManagerFace,
} from "@/Domain/faces/managerFace";
import { managerAvatarUrl, personFaceUrl, PERSON_FACE_VERSION } from "@/Domain/faces/faceUrl";
import { HAIR_COLORS, SKIN_COLORS } from "@/Domain/faces/faceTraits";
import { playerFaceSvg } from "@/Domain/faces/playerFaceSvg";
import { mulberry32 } from "@/Domain/rng";

describe("staff and manager faces", () => {
  test("deterministic per id, nationality, colours and age", () => {
    const a = personFaceSvg("staff_1", "Brazil", ["#123456", "#ffffff"], { age: 50 });
    expect(personFaceSvg("staff_1", "Brazil", ["#123456", "#ffffff"], { age: 50 })).toBe(a);
    expect(a.startsWith("<svg")).toBe(true);
    const ids = new Set(["a", "b", "c", "d", "e"].map((id) => personFaceSvg(id, "England", undefined, { age: 45 })));
    expect(ids.size).toBe(5);
  });

  test("no match jersey: a plain shirt in the club colour", () => {
    const svg = personFaceSvg("coach_7", "Italy", ["#123456", "#abcdef"]);
    expect(svg.toLowerCase()).toContain("#123456");
    // A staff face is not the player's face for the same id.
    expect(svg).not.toBe(playerFaceSvg("coach_7", "Italy", ["#123456", "#abcdef"]));
  });

  test("ageing adds lines and grey hair; a young face keeps a clean forehead", () => {
    const face = () => ({
      hair: { id: "longHair", color: HAIR_COLORS.black },
      hairBg: { id: "longHair" },
      eyeLine: { id: "none" },
      smileLine: { id: "none", size: 1 },
      miscLine: { id: "freckles1" },
      glasses: { id: "none" },
    });
    let greyOld = 0;
    let linesOld = 0;
    let linesYoung = 0;
    for (let i = 0; i < 200; i++) {
      const old = face();
      ageFace(old, 66, mulberry32(i));
      if (old.hair.color !== HAIR_COLORS.black) greyOld++;
      if (old.eyeLine.id !== "none") linesOld++;
      expect(old.hair.id).not.toBe("longHair");
      expect(old.hairBg.id).toBe("none");
      const young = face();
      ageFace(young, 25, mulberry32(i));
      if (young.eyeLine.id !== "none" || young.miscLine.id !== "none") linesYoung++;
      expect(young.hair.color).toBe(HAIR_COLORS.black);
    }
    expect(greyOld).toBeGreaterThan(150);
    expect(linesOld).toBe(200);
    expect(linesYoung).toBe(0);
  });

  test("the avatar follows the picked traits and glasses", () => {
    const face: ManagerFace = { seed: 42, skin: 7, hairColor: "red", hairLength: "short", beard: "full", glasses: true };
    const svg = personFaceSvg("avatar", "Brazil", undefined, { custom: face });
    expect(svg).toContain(SKIN_COLORS[7]);
    expect(svg).toContain(HAIR_COLORS.red);
    // Another seed is another face; same seed, same face whatever the id.
    expect(personFaceSvg("x", "Brazil", undefined, { custom: face })).toBe(svg);
    expect(personFaceSvg("avatar", "Brazil", undefined, { custom: { ...face, seed: 43 } })).not.toBe(svg);
    const noGlasses = personFaceSvg("avatar", "Brazil", undefined, { custom: { ...face, glasses: false } });
    expect(noGlasses).not.toBe(svg);
  });

  test("cropped to a square for the round avatar", () => {
    expect(croppedPersonFaceSvg("s", null, undefined)).toContain('viewBox="-80 40 560 560"');
  });

  test("generation does not leave Math.random patched", () => {
    const before = Math.random;
    personFaceSvg("s", "Japan", undefined, { custom: { seed: 1 } });
    expect(Math.random).toBe(before);
  });
});

describe("manager face parameters", () => {
  test("body validation: absent, valid, invalid", () => {
    expect(parseManagerFace(undefined)).toBeUndefined();
    expect(parseManagerFace({ seed: 3 })).toEqual({ seed: 3 });
    expect(parseManagerFace({ seed: 3, skin: 2, hairColor: "grey", hairLength: "bald", beard: "stubble", glasses: false }))
      .toEqual({ seed: 3, skin: 2, hairColor: "grey", hairLength: "bald", beard: "stubble", glasses: false });
    for (const bad of [null, "x", [], {}, { seed: -1 }, { seed: 1.5 }, { seed: MAX_FACE_SEED + 1 }, { seed: 1, skin: 8 },
      { seed: 1, hairColor: "green" }, { seed: 1, hairLength: "mullet" }, { seed: 1, beard: "goatee" },
      { seed: 1, glasses: "yes" }, { seed: 1, svg: "<svg/>" }]) {
      expect(parseManagerFace(bad)).toBeNull();
    }
  });

  test("query round trip and invalid values", () => {
    const face: ManagerFace = { seed: 99, skin: 4, hairColor: "blond", hairLength: "long", beard: "none", glasses: true };
    expect(parseManagerFaceQuery(managerFaceQuery(face))).toEqual(face);
    expect(parseManagerFaceQuery(managerFaceQuery({ seed: 0 }))).toEqual({ seed: 0 });
    for (const q of ["", "seed=abc", "seed=1&skin=0", "seed=1&skin=12", "seed=1&hc=pink", "seed=1&glasses=2", "seed=99999999999"]) {
      expect(parseManagerFaceQuery(new URLSearchParams(q))).toBeNull();
    }
  });

  test("random seeds are valid", () => {
    for (let i = 0; i < 20; i++) expect(parseManagerFace({ seed: randomFaceSeed() })).not.toBeNull();
    expect(randomFaceSeed(() => 0.999999999)).toBeLessThanOrEqual(MAX_FACE_SEED);
  });

  test("URLs carry the version and the parameters", () => {
    expect(personFaceUrl("staff_1", "Brazil", ["#ff0000"], 52.4))
      .toBe(`/api/faces/person/staff_1.svg?v=${PERSON_FACE_VERSION}&nat=Brazil&colors=ff0000&age=52`);
    expect(personFaceUrl("a b")).toBe(`/api/faces/person/a%20b.svg?v=${PERSON_FACE_VERSION}`);
    const url = managerAvatarUrl({ seed: 5, glasses: true }, "Portugal", ["#00ff00"]);
    expect(url.startsWith("/api/faces/manager/avatar.svg?")).toBe(true);
    const q = new URLSearchParams(url.split("?")[1]);
    expect(parseManagerFaceQuery(q)).toEqual({ seed: 5, glasses: true });
    expect(q.get("nat")).toBe("Portugal");
  });
});

describe("manager face URL", () => {
  test("saved avatar first, the id-based face otherwise", async () => {
    const { managerFaceUrl } = await import("@/Domain/faces/faceUrl");
    const { managerFaceCountry } = await import("@/Domain/faces/managerFace");
    expect(managerFaceUrl({ id: "player", face: { seed: 3 } })).toContain("/api/faces/manager/avatar.svg?seed=3");
    expect(managerFaceUrl({ id: "coach_9" })).toContain("/api/faces/person/coach_9.svg");
    expect(managerFaceCountry("br")).toBe("Brazil");
    expect(managerFaceCountry("GB")).toBe("England");
    expect(managerFaceCountry("zz")).toBeNull();
  });
});
