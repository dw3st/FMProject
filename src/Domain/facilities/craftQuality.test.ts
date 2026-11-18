import { describe, expect, test } from "bun:test";
import { wearDay } from "@/Domain/facilities/facilityItems";
import { applyCompletion } from "@/Domain/facilities/facilities";
import type { ClubFacilities, FacilityProject } from "@/types/facilityTypes";

type Items = ClubFacilities["items"];
const items = (q?: "good" | "excellent"): Items => ({
  stadiumPitch: { level: 6, wear: 0.1 }, seats: { level: 6, wear: 0.1, ...(q ? { quality: q } : {}) },
  stadiumStructure: { level: 6, wear: 0.1 }, trainingPitches: { level: 6, wear: 0.1 }, gym: { level: 6, wear: 0.1 },
  pool: { level: 6, wear: 0.1 }, physio: { level: 6, wear: 0.1 }, canteen: { level: 6, wear: 0.1 },
  academyPitches: { level: 6, wear: 0.1 }, academyLodging: { level: 6, wear: 0.1 },
} as Items);

describe("craft quality on items", () => {
  test("excellent seats wear 30% slower", () => {
    const d = { homeGames: 1, session: null, pitchWearMult: 1 } as unknown as Parameters<typeof wearDay>[1];
    const base = wearDay(items(), d).items.seats.wear - 0.1;
    const exc = wearDay(items("excellent"), d).items.seats.wear - 0.1;
    expect(base).toBeGreaterThan(0);
    expect(exc).toBeCloseTo(base * 0.7, 10);
  });
  test("a craft works writes its quality; a works without quality clears it", () => {
    const p = { id: "x", kind: "repair", item: "seats", to: 100, start: "2027-01-01", end: "2027-01-02", cost: 0, boardShare: 0, instalments: 0, paid: 0, craft: true, quality: "good" } as FacilityProject;
    expect(applyCompletion(items(), p).seats.quality).toBe("good");
    const { quality: _q, craft: _c, ...plain } = p;
    expect(applyCompletion(items("excellent"), plain as FacilityProject).seats.quality).toBeUndefined();
  });
});
