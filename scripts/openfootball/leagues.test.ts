import { describe, expect, test } from "bun:test";
import { CONTINENT, OVERLAP, buildCountryEntry, keptLeagues, scheduleFor, zonesFor } from "@/../scripts/openfootball/leagues";
import type { SeedLeague } from "@/../scripts/openfootball/types";

const L = (slug: string, country: string, tier: number, countryName = country): SeedLeague =>
  ({ slug, name: slug, country, countryName, tier, reputation: 1000 });

describe("keptLeagues", () => {
  test("descarta sobrepostas e < 8 clubes", () => {
    const leagues = [L("premier-league", "gb", 1), L("championship", "gb", 2), L("tiny", "lv", 1)];
    const counts = new Map([["premier-league", 18], ["championship", 19], ["tiny", 3]]);
    expect(keptLeagues(leagues, counts).map((l) => l.slug)).toEqual(["championship"]);
    expect(OVERLAP["premier-league"]).toBe("premier_league");
  });
});

describe("zonesFor", () => {
  test("nível do meio ganha prom e rel; topo sem nível abaixo não ganha nada", () => {
    expect(zonesFor({ clubs: 20, hasAbove: true, hasBelow: true })).toEqual([
      { id: "prom", label: "Promotion", color: "green", from: 1, to: 3 },
      { id: "rel", label: "Relegation", color: "red", fromEnd: 3 },
    ]);
    expect(zonesFor({ clubs: 12, hasAbove: false, hasBelow: true })).toEqual([
      { id: "rel", label: "Relegation", color: "red", fromEnd: 2 },
    ]);
    expect(zonesFor({ clubs: 12, hasAbove: false, hasBelow: false })).toEqual([]);
  });
});

describe("scheduleFor", () => {
  test("ano civil vs europeu, meio de semana em ligas longas", () => {
    expect(scheduleFor("of_x", "br", 20, 0)).toMatchObject({ seasonStartMMDD: "02-05", crossYear: false, matchDays: [6, 0] });
    expect(scheduleFor("of_y", "pt", 18, 1)).toMatchObject({ seasonStartMMDD: "08-15", seasonEndMMDD: "05-17", crossYear: true, baseWeekOffset: 1 });
    expect(scheduleFor("of_z", "us", 30, 7).matchDays).toEqual([3, 6, 0]);
    expect(scheduleFor("of_z", "us", 30, 7).baseWeekOffset).toBe(2);
  });
});

describe("buildCountryEntry / CONTINENT", () => {
  test("England usa gb-eng; demais código minúsculo", () => {
    expect(buildCountryEntry("gb", "England").flag).toBe("gb-eng");
    expect(buildCountryEntry("uy", "Uruguay")).toMatchObject({ slug: "uruguay", flag: "uy", iso2: "UY", playable: true, continent: "South America" });
    expect(buildCountryEntry("za", "South Africa").slug).toBe("south_africa");
  });
  test("todo país do seed com liga mantida tem continente", () => {
    for (const code of ["ae","al","am","ar","at","au","be","bg","br","by","ch","cl","cm","co","cy","cz","de","dk","dz","eg","es","fi","fj","fr","gb","ge","gh","gr","hr","hu","id","il","ir","is","it","jp","ke","kz","mt","mx","ng","nl","no","pe","pl","pt","py","rs","ru","sa","se","si","sk","tr","ua","us","uy","uz","ve","za"]) {
      expect(CONTINENT[code]).toBeDefined();
    }
  });
});
