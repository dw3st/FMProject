import { describe, expect, test } from "bun:test";
import {
  baseCountryKnowledge, countryBand, countryGainMult, countryKnowledgeMap, countryKnowledgeOf, countryNoiseMult,
  growCountryKnowledge, isScoutRole, meanKnowledge, pruneCountryKnowledge, strongCountry,
} from "@/Domain/scouting/countryKnowledge";

const scout = (extra: object = {}) => ({ nationality: "England", ...extra });

describe("country knowledge", () => {
  test("base from the nationality", () => {
    expect(baseCountryKnowledge("England", "England")).toBe(90);
    expect(baseCountryKnowledge("England", "Spain")).toBe(40);
    expect(baseCountryKnowledge("England", "Brazil")).toBe(0);
    expect(baseCountryKnowledge("", "Brazil")).toBe(0);
    expect(baseCountryKnowledge("England", "")).toBe(0);
  });

  test("neutral is exactly 1", () => {
    expect(countryGainMult(40)).toBe(1);
    expect(countryNoiseMult(40)).toBe(1);
    expect(countryGainMult(0)).toBeCloseTo(0.75);
    expect(countryGainMult(90)).toBeCloseTo(1.1667, 3);
    expect(countryGainMult(100)).toBeCloseTo(1.2);
    expect(countryNoiseMult(0)).toBeCloseTo(1.15);
    expect(countryNoiseMult(100)).toBeCloseTo(0.85);
  });

  test("growth saturates and stamps the day", () => {
    const g = growCountryKnowledge(scout(), [{ country: "Brazil", rate: 0.06 }], "2027-03-01");
    expect(g.Brazil).toEqual({ k: 6, last: "2027-03-01" });
    let m: ReturnType<typeof scout> & { countryKnowledge?: ReturnType<typeof growCountryKnowledge> } = scout();
    for (let w = 0; w < 12; w++) {
      m = { ...m, countryKnowledge: growCountryKnowledge(m, [{ country: "Spain", rate: 0.06 }], "2027-03-01") };
    }
    expect(countryKnowledgeOf(m, "Spain", "2027-03-01")).toBeCloseTo(71.4, 0);
    // A visit with no country or no rate is ignored.
    expect(growCountryKnowledge(scout(), [{ country: "", rate: 0.06 }, { country: "Spain", rate: 0 }], "2027-03-01")).toEqual({});
  });

  test("decays after 180 days down to the base; the own country never", () => {
    const m = scout({
      countryKnowledge: {
        Spain: { k: 71, last: "2027-01-01" },
        Brazil: { k: 52, last: "2027-01-01" },
        England: { k: 100, last: "2027-01-01" },
      },
    });
    expect(countryKnowledgeOf(m, "Spain", "2027-06-30")).toBe(71);            // inside the grace
    expect(countryKnowledgeOf(m, "Spain", "2027-07-30")).toBeCloseTo(66, 0);  // 30 days past it
    expect(countryKnowledgeOf(m, "Spain", "2029-01-01")).toBe(40);            // floor: continent
    expect(countryKnowledgeOf(m, "Brazil", "2029-01-01")).toBe(0);            // floor: other
    expect(countryKnowledgeOf(m, "England", "2035-01-01")).toBe(100);         // never falls
  });

  test("bands, prune and strong country", () => {
    expect(countryBand(90)).toBe("full");
    expect(countryBand(70)).toBe("full");
    expect(countryBand(40)).toBe("moderate");
    expect(countryBand(25)).toBe("moderate");
    expect(countryBand(10)).toBe("none");
    const m = scout({ countryKnowledge: { Spain: { k: 40, last: "2026-01-01" }, Brazil: { k: 95, last: "2027-01-01" } } });
    expect(Object.keys(pruneCountryKnowledge(m, "2027-01-02"))).toEqual(["Brazil"]);
    expect(strongCountry(m, "2027-01-02")).toEqual({ country: "Brazil", k: 95 });
    expect(strongCountry(scout(), "2027-01-02")).toEqual({ country: "England", k: 90 });
  });

  test("map and mean", () => {
    const map = countryKnowledgeMap(scout(), "2027-01-01");
    expect(map.England).toBe(90);
    expect(map.Spain).toBe(40);
    expect(map.Brazil).toBeUndefined();
    expect(meanKnowledge(scout(), ["England", "Spain", "Brazil"], "2027-01-01")).toBe(43);
    expect(meanKnowledge(scout(), [], "2027-01-01")).toBe(0);
  });

  test("scout roles", () => {
    expect(isScoutRole("scout")).toBe(true);
    expect(isScoutRole("fieldScout")).toBe(true);
    expect(isScoutRole("coach")).toBe(false);
  });
});
