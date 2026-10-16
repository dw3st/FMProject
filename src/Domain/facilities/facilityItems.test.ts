import { describe, expect, test } from "bun:test";
import { FACILITIES as F } from "@/Domain/facilities/facilityConfig";
import {
  FACILITY_ITEMS, ITEM_GROUP, comfortLevel, conditionOf, crossings, effectAt, groupLevel, initialItems, startBaseLevel,
  itemEffects, itemWearToday, itemsOfGroup, lerpLevel, lifeScale, penalty, physioDurationMult, wearDay, wearFor,
  type FacilityItems, type WearDayInput,
} from "@/Domain/facilities/facilityItems";
import type { ClubFacilities } from "@/types/facilityTypes";

describe("facility items config", () => {
  test("ten items in three groups", () => {
    expect(FACILITY_ITEMS).toHaveLength(10);
    expect(itemsOfGroup("stadium")).toEqual(["stadiumPitch", "seats", "stadiumStructure"]);
    expect(itemsOfGroup("training")).toEqual(["trainingPitches", "gym", "pool", "physio", "canteen"]);
    expect(itemsOfGroup("academy")).toEqual(["academyPitches", "academyLodging"]);
  });
  test("lives 1..5 seasons and wear shares sum to 1", () => {
    for (const id of FACILITY_ITEMS) {
      const it = F.ITEMS[id];
      expect(it.life).toBeGreaterThanOrEqual(1);
      expect(it.life).toBeLessThanOrEqual(5);
      expect(it.time + it.matches + it.training).toBeCloseTo(1, 9);
      expect(ITEM_GROUP[id]).toBeDefined();
    }
  });
});

const items = (over: Partial<FacilityItems> = {}, level = 6, wear = 0): FacilityItems => {
  const out = {} as FacilityItems;
  for (const id of FACILITY_ITEMS) out[id] = { level, wear };
  return { ...out, ...over };
};
const fac = (it: FacilityItems): ClubFacilities => ({
  stands: [], items: it, projects: [], completed: [], anchor: { capacity: 0, followers: 0, tier: 1 }, attendance: [],
});

describe("condition and wear", () => {
  test("condition from wear", () => {
    expect(conditionOf({ wear: 0 })).toBe(100);
    expect(conditionOf({ wear: 0.775 })).toBeCloseTo(40, 0);
    expect(conditionOf({ wear: 1 })).toBe(0);
    expect(conditionOf({ wear: 2 })).toBe(0);
    expect(conditionOf({ wear: 0, condemned: true })).toBe(0);
    for (const c of [100, 80, 40, 15, 3]) expect(conditionOf({ wear: wearFor(c) })).toBeCloseTo(c, 2);
  });

  test("life scale by level", () => {
    expect(lifeScale(5)).toBe(1);
    expect(lifeScale(10)).toBeCloseTo(1.25, 10);
    expect(lifeScale(1)).toBeCloseTo(0.8, 10);
  });

  const quiet: WearDayInput = { homeGames: 0, session: null, pitchWearMult: 1 };
  test("a time-only item at level 5 wears 1/life per year", () => {
    let w = 0;
    for (let d = 0; d < 365; d++) w += itemWearToday("canteen", 5, quiet);
    expect(w).toBeCloseTo(0.2, 9);
  });

  test("a typical season consumes the stadium pitch's whole life at level 5", () => {
    let w = 0;
    for (let d = 0; d < 365; d++) w += itemWearToday("stadiumPitch", 5, quiet);
    for (let g = 0; g < 25; g++) w += itemWearToday("stadiumPitch", 5, { ...quiet, homeGames: 1 }) - itemWearToday("stadiumPitch", 5, quiet);
    expect(w).toBeCloseTo(1, 9);
    let t = 0;
    for (let d = 0; d < 365; d++) t += itemWearToday("trainingPitches", 5, quiet);
    for (let s = 0; s < 200; s++) t += itemWearToday("trainingPitches", 5, { ...quiet, session: "normal" }) - itemWearToday("trainingPitches", 5, quiet);
    expect(t).toBeCloseTo(1, 9);
  });

  test("heavy training wears 1.3× normal; the groundskeeper only touches pitches", () => {
    const base = itemWearToday("gym", 5, quiet);
    const normal = itemWearToday("gym", 5, { ...quiet, session: "normal" }) - base;
    const heavy = itemWearToday("gym", 5, { ...quiet, session: "heavy" }) - base;
    expect(heavy / normal).toBeCloseTo(1.3, 9);
    expect(itemWearToday("gym", 5, { ...quiet, pitchWearMult: 1.6 })).toBe(base);
    expect(itemWearToday("stadiumPitch", 5, { ...quiet, pitchWearMult: 1.6 }) / itemWearToday("stadiumPitch", 5, quiet)).toBeCloseTo(1.6, 9);
    expect(itemWearToday("academyPitches", 5, { ...quiet, pitchWearMult: 1.6 }) / itemWearToday("academyPitches", 5, quiet)).toBeCloseTo(1.3, 9);
  });

  test("wearDay wears every item", () => {
    const start = items();
    const r = wearDay(start, { homeGames: 1, session: null, pitchWearMult: 1 });
    for (const id of FACILITY_ITEMS) expect(r.items[id].wear).toBeGreaterThan(0);
    expect(r.crossings).toHaveLength(0);
  });
});

describe("crossings", () => {
  test("warns once below 40, condemns below 15, re-arms above 40", () => {
    const at = (c: number, extra = {}) => items({ stadiumPitch: { level: 6, wear: wearFor(c), ...extra } });
    expect(crossings(at(41)).crossings).toHaveLength(0);
    const r1 = crossings(at(39));
    expect(r1.crossings).toHaveLength(1);
    expect(r1.crossings[0]!.item).toBe("stadiumPitch");
    expect(r1.crossings[0]!.kind).toBe("worn");
    expect(r1.crossings[0]!.condition).toBeCloseTo(39, 6);
    expect(r1.items.stadiumPitch.alert).toBe(40);
    expect(crossings(r1.items).crossings).toHaveLength(0);
    const r2 = crossings(at(14, { alert: 40 }));
    expect(r2.crossings[0]!.kind).toBe("condemned");
    expect(r2.items.stadiumPitch.condemned).toBe(true);
    expect(crossings(r2.items).crossings).toHaveLength(0);
    const r3 = crossings(at(60, { alert: 40 }));
    expect(r3.items.stadiumPitch.alert).toBeUndefined();
    const same = at(70);
    expect(crossings(same).items).toBe(same);
  });
});

describe("levels", () => {
  test("group level = mean level / 2; condemned counts 1", () => {
    expect(groupLevel(fac(items()), "training")).toBe(3);
    expect(groupLevel(fac(items({ gym: { level: 6, wear: 0, condemned: true } })), "training")).toBeCloseTo(2.5, 10);
    expect(comfortLevel(fac(items({ seats: { level: 4, wear: 0 } })))).toBe(2);
  });

  test("lerpLevel interpolates the 1..5 tables", () => {
    const arr = [0.95, 0.975, 1, 1.05, 1.1];
    expect(lerpLevel(arr, 3)).toBe(1);
    expect(lerpLevel(arr, 3.5)).toBeCloseTo(1.025, 10);
    expect(lerpLevel(arr, 0.5)).toBe(0.95);
    expect(lerpLevel(arr, 7)).toBe(1.1);
  });

  test("penalty and effects", () => {
    expect(penalty(40)).toBe(0);
    expect(penalty(80)).toBe(0);
    expect(penalty(20)).toBe(0.5);
    expect(penalty(0)).toBe(1);
    expect(effectAt(1.6, 20)).toBeCloseTo(1.3, 10);
    expect(effectAt(0.9, 0)).toBeCloseTo(0.9, 10);
  });

  test("initial items: deterministic, 2 × implied level, seats 2, never below 80%", () => {
    const a = initialItems("club-1", 3);
    expect(initialItems("club-1", 3)).toEqual(a);
    expect(initialItems("club-2", 3)).not.toEqual(a);
    for (const id of FACILITY_ITEMS) {
      expect(a[id].level).toBe(id === "seats" ? 2 : 6);
      expect(conditionOf(a[id])).toBeGreaterThanOrEqual(79.7);
    }
    for (let i = 0; i < 50; i++) {
      const it = initialItems(`c${i}`, 2);
      for (const id of FACILITY_ITEMS) expect(conditionOf(it[id])).toBeGreaterThanOrEqual(79.7);
    }
  });
});

describe("starting levels by revenue (4.22.2)", () => {
  test("base follows the revenue percentile", () => {
    expect(startBaseLevel(0)).toBe(2);
    expect(startBaseLevel(0.5)).toBe(5);
    expect(startBaseLevel(1)).toBe(8);
    expect(startBaseLevel(2)).toBe(8);
  });

  test("each item within ± jitter of the base, seats included; wear draws unchanged", () => {
    let spread = 0;
    for (let i = 0; i < 200; i++) {
      const pct = (i % 11) / 10;
      const it = initialItems(`c${i}`, 3, pct);
      const old = initialItems(`c${i}`, 3);
      const base = startBaseLevel(pct);
      const levels = new Set<number>();
      for (const id of FACILITY_ITEMS) {
        expect(Math.abs(it[id].level - base)).toBeLessThanOrEqual(F.START_LEVEL.JITTER + 0.5);
        expect(it[id].level).toBeGreaterThanOrEqual(1);
        expect(it[id].level).toBeLessThanOrEqual(F.ITEM_MAX_LEVEL);
        expect(it[id].wear).toBe(old[id].wear);
        levels.add(it[id].level);
      }
      if (levels.size > 1) spread++;
    }
    expect(spread).toBeGreaterThan(150);
    expect(initialItems("x", 3, 0.7)).toEqual(initialItems("x", 3, 0.7));
  });

  test("richer clubs start better on average", () => {
    const mean = (pct: number) => {
      let s = 0;
      for (let i = 0; i < 100; i++) {
        const it = initialItems(`m${i}`, 3, pct);
        for (const id of FACILITY_ITEMS) s += it[id].level;
      }
      return s / 1000;
    };
    expect(mean(0.95)).toBeGreaterThan(mean(0.5) + 2);
    expect(mean(0.5)).toBeGreaterThan(mean(0.05) + 2);
  });
});

describe("physio and injury duration", () => {
  test("neutral at the starting level and a good condition; worse shorter/longer", () => {
    expect(physioDurationMult({ level: 6, wear: 0.2 }, 3)).toBe(1);
    expect(physioDurationMult({ level: 6, wear: wearFor(0) }, 3)).toBeCloseTo(1.25, 10);
    expect(physioDurationMult({ level: 6, wear: wearFor(20) }, 3)).toBeCloseTo(1.125, 10);
    expect(physioDurationMult({ level: 10, wear: 0 }, 3)).toBeCloseTo(0.88, 10);
    expect(physioDurationMult({ level: 2, wear: 0 }, 3)).toBeCloseTo(1.12, 10);
    expect(physioDurationMult({ level: 6, wear: 0, condemned: true }, 3)).toBeCloseTo(1.15 * 1.25, 10);
  });
});

describe("itemEffects", () => {
  test("nothing from 40% up; the maximum at 0%", () => {
    for (const id of FACILITY_ITEMS) expect(itemEffects(id, 40)).toEqual([]);
    expect(itemEffects("stadiumPitch", 0)).toEqual([{ key: "matchInjury", value: F.WEAR.PITCH_INJURY_MAX }]);
    expect(itemEffects("physio", 20).map((e) => e.key)).toEqual(["recovery", "injuryDays"]);
    expect(itemEffects("academyLodging", 0)[0]).toEqual({ key: "intakeQuality", value: -F.WEAR.ACADEMY_QUALITY_MAX_LOSS });
    expect(itemEffects("seats", 20)[0]!.value).toBeCloseTo(effectAt(F.WEAR.SEATS_DEMAND_MIN, 20), 10);
  });
});

describe("turf wear (spec 2026-10-16)", () => {
  test("the stadium pitch wears × the grass; other items do not change", () => {
    const base = initialItems("33", 3);
    const day = { homeGames: 1, session: "normal" as const, pitchWearMult: 1 };
    const natural = wearDay(base, day).items;
    const hybrid = wearDay({ ...base, stadiumPitch: { ...base.stadiumPitch, turf: "hybrid" } }, day).items;
    const dN = natural.stadiumPitch.wear - base.stadiumPitch.wear;
    const dH = hybrid.stadiumPitch.wear - base.stadiumPitch.wear;
    expect(dH).toBeCloseTo(dN * 0.6, 12);
    expect(hybrid.stadiumPitch.turf).toBe("hybrid");
    expect(hybrid.seats.wear).toBe(natural.seats.wear);
  });
});
