import { describe, expect, test } from "bun:test";
import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import { FACILITY_ITEMS } from "@/Domain/facilities/facilityItems";
import { benefitContext, itemLevelBenefit, itemLevelTrack, lifeUntilWorn } from "@/Domain/facilities/levelBenefit";
import type { FacilityItemId } from "@/types/facilityTypes";

const at = (level: number, implied = 3) =>
  benefitContext(Object.fromEntries(FACILITY_ITEMS.map((id) => [id, { level }])) as Record<FacilityItemId, { level: number }>, implied);

describe("itemLevelBenefit", () => {
  test("every item at the neutral level 6 (group 3) is neutral for the group effects", () => {
    const ctx = at(6);
    expect(itemLevelBenefit("gym", 6, ctx)[0]!.value).toBeCloseTo(1, 10);
    expect(itemLevelBenefit("pool", 6, ctx)[0]!.value).toBeCloseTo(1, 10);
    expect(itemLevelBenefit("physio", 6, ctx)[1]!.value).toBeCloseTo(1, 10);
    expect(itemLevelBenefit("academyPitches", 6, ctx)[0]!.value).toBeCloseTo(0, 10);
  });

  test("a training item moves the group by its share (5 items: +1 level = +0.1 group level)", () => {
    const ctx = at(6);
    // group 3 → 3.1: dev 1 → 1.01
    expect(itemLevelBenefit("gym", 7, ctx)[0]!.value).toBeCloseTo(1.01, 10);
    expect(itemLevelBenefit("canteen", 10, ctx)[0]!.value).toBeCloseTo(1.04, 10);
    expect(itemLevelBenefit("trainingPitches", 7, ctx)[1]!.value).toBeCloseTo(0.985, 10);
  });

  test("seats: the ticket price of comfort = level / 2", () => {
    const ctx = at(6);
    expect(itemLevelBenefit("seats", 2, ctx)[0]!.value).toBeCloseTo(1, 10);
    expect(itemLevelBenefit("seats", 10, ctx)[0]!.value).toBeCloseTo(1 + 4 * F.COMFORT_PRICE_STEP, 10);
  });

  test("stadium pitch and structure: seasons until 40% grow with the level", () => {
    const ctx = at(6);
    const lo = itemLevelBenefit("stadiumStructure", 1, ctx)[0]!;
    const hi = itemLevelBenefit("stadiumStructure", 10, ctx)[0]!;
    expect(lo.key).toBe("life");
    expect(hi.value).toBeGreaterThan(lo.value);
    expect(lifeUntilWorn("stadiumPitch", 5)).toBeCloseTo(0.775, 2);
  });

  test("academy is relative to the tier, physio days to twice the implied level", () => {
    expect(itemLevelBenefit("academyLodging", 6, at(6, 4))[1]!.value).toBeCloseTo(-F.ACADEMY_QUALITY_STEP, 10);
    expect(itemLevelBenefit("physio", 8, at(6, 4))[1]!.value).toBeCloseTo(1, 10);
    expect(itemLevelBenefit("physio", 10, at(6, 2))[1]!.value).toBeCloseTo(F.WEAR.PHYSIO_DURATION_LEVEL_MIN, 10);
  });

  test("a condemned item counts level 1 for the others", () => {
    const items = Object.fromEntries(FACILITY_ITEMS.map((id) => [id, { level: 6 }])) as Record<FacilityItemId, { level: number; condemned?: boolean }>;
    items.pool = { level: 6, condemned: true };
    const ctx = benefitContext(items, 3);
    expect(ctx.levels.pool).toBe(1);
    expect(itemLevelBenefit("gym", 6, ctx)[0]!.value).toBeLessThan(1);
  });

  test("the track has ten levels, each with the same keys", () => {
    for (const id of FACILITY_ITEMS) {
      const track = itemLevelTrack(id, at(5));
      expect(track).toHaveLength(F.ITEM_MAX_LEVEL);
      expect(new Set(track.map((v) => v.map((x) => x.key).join()))).toHaveProperty("size", 1);
    }
  });
});
