import { describe, expect, test } from "bun:test";
import { statsCompetitionOptions } from "@/GameInterface/statsCompetitionOptions";
import type { LeagueData } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";

const league = (slug: string, name: string, country: string) => ({ slug, name, country }) as unknown as LeagueData;
const country = (name: string, continent: CountryEntry["continent"]): CountryEntry =>
  ({ slug: name.toLowerCase(), name, flag: "", iso2: "", playable: true, headline: "", continent });
const t = (key: string, o?: { defaultValue: string }) => o?.defaultValue ?? key;

describe("statsCompetitionOptions", () => {
  const leagues = [
    league("brazil_serie_a", "Série A", "Brazil"),
    league("premier_league", "Premier League", "England"),
    league("of_championship", "Championship", "England"),
  ];
  const byName = new Map([["Brazil", country("Brazil", "South America")], ["England", country("England", "Europe")]]);

  test("'all' comes first, then continent -> continental -> country -> leagues by tier -> cup", () => {
    const opts = statsCompetitionOptions(leagues, byName, "en", t);
    expect(opts[0]?.value).toBe("all");
    expect(opts.slice(1).map((o) => o.value)).toEqual([
      "ucl", "uel", "premier_league", "of_championship", "cup_england",
      "lib", "sud", "brazil_serie_a", "cup_brazil",
    ]);
    expect(opts.find((o) => o.value === "premier_league")).toMatchObject({ group: "Europe", subgroup: "England" });
    expect(opts.find((o) => o.value === "ucl")?.subgroup).toBeUndefined();
  });

  test("values are unique", () => {
    const opts = statsCompetitionOptions(leagues, byName, "en", t);
    expect(new Set(opts.map((o) => o.value)).size).toBe(opts.length);
  });
});
