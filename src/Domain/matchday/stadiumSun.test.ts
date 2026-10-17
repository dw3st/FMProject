import { describe, expect, test } from "bun:test";
import { COVERED_SHARE, stadiumIdOf, stadiumSun } from "@/Domain/matchday/stadiumSun";

describe("stadiumIdOf", () => {
  test("from the venue name and city, accents and case folded", () => {
    expect(stadiumIdOf({ id: "33", venue: { name: "Old Trafford", city: "Manchester" } })).toBe("std_old_trafford_manchester");
    expect(stadiumIdOf({ id: "x", venue: { name: "Estádio do Maracanã", city: "Rio de Janeiro" } })).toBe("std_estadio_do_maracana_rio_de_janeiro");
  });
  test("two clubs sharing a ground share the id; no venue = the club's own; neutral = the match's", () => {
    const sanSiro = { name: "San Siro", city: "Milano" };
    expect(stadiumIdOf({ id: "inter", venue: sanSiro })).toBe(stadiumIdOf({ id: "milan", venue: sanSiro }));
    expect(stadiumIdOf({ id: "of_a-b" })).toBe("std_club_of_a_b");
    expect(stadiumIdOf({ id: "33", venue: sanSiro }, "f12")).toBe("std_neutral_f12");
  });
});

describe("stadiumSun", () => {
  test("deterministic per stadium, every field in range, a few covered", () => {
    expect(stadiumSun("std_a")).toEqual(stadiumSun("std_a"));
    const all = Array.from({ length: 2000 }, (_, i) => stadiumSun(`std_${i}`));
    expect(new Set(all.map((s) => s.side))).toEqual(new Set(["top", "bottom"]));
    expect(new Set(all.map((s) => s.cut))).toEqual(new Set(["lean", "both", "none"]));
    for (const s of all) {
      expect(Math.abs(s.lean)).toBeLessThanOrEqual(1);
      expect(s.height).toBeGreaterThanOrEqual(0.75);
      expect(s.height).toBeLessThanOrEqual(1.25);
      expect(s.cutX).toBeGreaterThanOrEqual(14);
      expect(s.cutX).toBeLessThanOrEqual(30);
    }
    const covered = all.filter((s) => s.covered).length / all.length;
    expect(Math.abs(covered - COVERED_SHARE)).toBeLessThan(0.02);
  });
});
