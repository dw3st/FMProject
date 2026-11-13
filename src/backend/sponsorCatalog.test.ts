import { describe, expect, test } from "bun:test";
import { builtInSponsorCatalog, parseSponsorCatalog, sponsorCatalog } from "@/backend/sponsorCatalog";
import { emptySponsors, generateOffers } from "@/Domain/sponsors/sponsors";

describe("sponsor catalog", () => {
  test("bad entries and repeated ids are dropped; colours fall back", () => {
    const parsed = parseSponsorCatalog([
      { id: "a", name: "Alfa", sector: "bank", size: "global", colors: ["#112233", "#ffffff"] },
      { id: "a", name: "Again", sector: "bank", size: "global", colors: ["#112233", "#ffffff"] },
      { id: "b", name: "Beta", sector: "food", size: "local", country: "Brazil", funny: true, colors: ["red", "#fff"] },
      { id: "c", name: "", sector: "food", size: "local" },
      { id: "d", name: "Delta", sector: "food", size: "huge" },
      null, 7,
    ]);
    expect(parsed).toEqual([
      { id: "a", name: "Alfa", sector: "bank", size: "global", colors: ["#112233", "#ffffff"] },
      { id: "b", name: "Beta", sector: "food", size: "local", colors: ["#1f2937", "#ffffff"], country: "Brazil", funny: true },
    ]);
    expect(parseSponsorCatalog({ companies: [{ id: "x", name: "X", size: "national" }] })).toHaveLength(1);
    expect(parseSponsorCatalog("nope")).toEqual([]);
  });

  test("the catalog in use and the built-in list fill every slot of any club", () => {
    for (const catalog of [sponsorCatalog(), builtInSponsorCatalog()]) {
      expect(new Set(catalog.map((c) => c.id)).size).toBe(catalog.length);
      for (const tier of ["LOW", "MEDIUM", "HIGH", "ELITE"] as const) {
        const offers = generateOffers(catalog, {
          saveId: "s", clubId: "c", season: 2026, date: "2026-08-15", country: "Nowhere", tier, base: 1_000_000, appeal: 1,
          leagueSize: 20, target: 10, continentalTo: 0, promotion: false, cup: false, attendanceAvg: null,
        }, emptySponsors());
        expect(offers).toHaveLength(11);
        expect(new Set(offers.map((o) => o.company.id)).size).toBe(11);
      }
    }
  });
});
