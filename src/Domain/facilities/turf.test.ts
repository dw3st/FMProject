import { describe, expect, test } from "bun:test";
import {
  TURF_TYPES, MOWING_PATTERNS, aiMowingOf, aiTurfOf, clubMowing, clubTurf, isMowingPattern, isTurfType,
  pitchInjury, turfInjuryMult, turfWearMult,
} from "@/Domain/facilities/turf";
import { pitchInjuryMult } from "@/Domain/facilities/facilityItems";
import type { Squad } from "@/types/playerTypes";

describe("turf", () => {
  test("guards", () => {
    expect(TURF_TYPES).toEqual(["natural", "hybrid", "synthetic"]);
    expect(MOWING_PATTERNS).toEqual(["stripes", "checker", "diagonal", "circles"]);
    expect(isTurfType("hybrid")).toBe(true);
    expect(isTurfType("grass")).toBe(false);
    expect(isMowingPattern("circles")).toBe(true);
    expect(isMowingPattern(3)).toBe(false);
  });

  test("multipliers; absent = natural", () => {
    expect(turfWearMult(undefined)).toBe(1);
    expect(turfWearMult("hybrid")).toBe(0.6);
    expect(turfWearMult("synthetic")).toBe(0.25);
    expect(turfInjuryMult("synthetic")).toBe(1.1);
    expect(turfInjuryMult("natural")).toBe(1);
    expect(pitchInjury(90, undefined)).toBe(1);
    expect(pitchInjury(20, "synthetic")).toBeCloseTo(pitchInjuryMult(20) * 1.1, 10);
  });

  test("AI grass: deterministic, and the shares by tier", () => {
    expect(aiTurfOf("33", "HIGH")).toBe(aiTurfOf("33", "HIGH"));
    const ids = Array.from({ length: 4000 }, (_, i) => `club_${i}`);
    const share = (tier: "LOW" | "MEDIUM" | "HIGH" | "ELITE", t: string) =>
      ids.filter((id) => aiTurfOf(id, tier) === t).length / ids.length;
    expect(share("HIGH", "hybrid")).toBeGreaterThan(0.45);
    expect(share("HIGH", "hybrid")).toBeLessThan(0.55);
    expect(share("HIGH", "synthetic")).toBe(0);
    expect(share("LOW", "synthetic")).toBeGreaterThan(0.07);
    expect(share("LOW", "synthetic")).toBeLessThan(0.13);
    expect(share("LOW", "hybrid")).toBe(0);
    expect(share("MEDIUM", "hybrid")).toBeGreaterThan(0.12);
    expect(share("MEDIUM", "hybrid")).toBeLessThan(0.18);
  });

  test("AI mowing: deterministic, every pattern used", () => {
    expect(aiMowingOf("33")).toBe(aiMowingOf("33"));
    const seen = new Set(Array.from({ length: 200 }, (_, i) => aiMowingOf(`c${i}`)));
    expect(seen.size).toBe(4);
  });

  test("club turf and mowing: the human club's items, else the AI rule", () => {
    const base = { id: "33", finances: { broadcasting: 300_000_000, commercial: 200_000_000 } } as unknown as Squad;
    expect(clubTurf(base)).toBe(aiTurfOf("33", "ELITE"));
    const human = {
      ...base,
      facilities: { items: { stadiumPitch: { level: 6, wear: 0, turf: "synthetic" } }, mowing: "checker" },
    } as unknown as Squad;
    expect(clubTurf(human)).toBe("synthetic");
    expect(clubMowing(human)).toBe("checker");
    const plain = { ...base, facilities: { items: { stadiumPitch: { level: 6, wear: 0 } } } } as unknown as Squad;
    expect(clubTurf(plain)).toBe("natural");
    expect(clubMowing(plain)).toBe("stripes");
  });
});
