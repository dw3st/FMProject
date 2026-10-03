import { describe, expect, test } from "bun:test";
import type { CountryEntry } from "@/types/worldTypes";
import countriesRaw from "@/example_data/countries.json";
import leagueDataRaw from "@/example_data/leagueData.json";
import { COUNTRY_MARKERS, COUNTRY_PATHS, MARKER_MAX_SIZE } from "@/GameInterface/NewGame/worldMapPaths";
import { mappableCountries } from "@/GameInterface/NewGame/worldMapCountries";

const countries = Object.values(countriesRaw as Record<string, CountryEntry>);
const leagueCountries = new Set(
  (leagueDataRaw as Array<{ country: string }>).map((l) => l.country),
);

describe("world map coverage", () => {
  test("every country with a league has a map path", () => {
    const missing = countries
      .filter((c) => leagueCountries.has(c.name))
      .filter((c) => !COUNTRY_PATHS[c.iso2.toUpperCase()])
      .map((c) => c.name);
    expect(missing).toEqual([]);
  });

  test("every league country is in the countries catalogue", () => {
    const names = new Set(countries.map((c) => c.name));
    expect([...leagueCountries].filter((n) => !names.has(n))).toEqual([]);
  });

  test("GB is England", () => {
    const gb = mappableCountries(countries).get("GB");
    expect(gb?.name).toBe("England");
  });

  test("paths are non-empty SVG path data", () => {
    for (const [iso, d] of Object.entries(COUNTRY_PATHS)) {
      expect(d.startsWith("M"), iso).toBe(true);
      expect(d.length).toBeGreaterThan(10);
    }
    for (const iso of Object.keys(COUNTRY_MARKERS)) expect(COUNTRY_PATHS[iso]).toBeDefined();
  });

  test("every playable country is big enough to click or has a marker", () => {
    // Size of the largest drawn piece (max of its box width/height), in viewBox units.
    const largestPiece = (d: string) =>
      Math.max(
        ...d.split("Z").filter(Boolean).map((ring) => {
          const pts = ring.replace(/^M/, "").split("L").map((p) => p.split(" ").map(Number));
          const xs = pts.map((p) => p[0]!);
          const ys = pts.map((p) => p[1]!);
          return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
        }),
      );
    const tooSmall = [...mappableCountries(countries).entries()]
      .filter(([, c]) => c.playable)
      .filter(([iso]) => largestPiece(COUNTRY_PATHS[iso]!) < MARKER_MAX_SIZE && !COUNTRY_MARKERS[iso])
      .map(([, c]) => c.name);
    expect(tooSmall).toEqual([]);
    expect(COUNTRY_MARKERS.FJ).toBeDefined();
  });
});
