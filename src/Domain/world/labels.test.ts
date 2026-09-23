import { describe, expect, test } from "bun:test";
import {
  CONTINENT_ORDER, competitionName, continentI18nKey, countryDisplayName, groupCountriesByContinent, leagueLabel,
  matchesCountryQuery, sortLeaguesForCountry,
} from "@/Domain/world/labels";
import type { CountryEntry } from "@/types/worldTypes";
import type { LeagueData } from "@/types/playerTypes";

const C = (name: string, iso2: string, continent: CountryEntry["continent"], slug = name.toLowerCase()): CountryEntry =>
  ({ slug, name, flag: iso2.toLowerCase(), iso2, playable: true, headline: "", continent });
const L = (slug: string, name: string, country: string): LeagueData =>
  ({ slug, name, country, season: "2024-25", standings: [] });

describe("countryDisplayName", () => {
  test("usa a tradução i18n quando existe", () => {
    const t = (key: string, o: { defaultValue: string }) => (key === "newGame.countries.england.name" ? "Inglaterra" : o.defaultValue);
    expect(countryDisplayName(C("England", "GB", "Europe", "england"), "pt-BR", t)).toBe("Inglaterra");
  });
  test("cai para Intl.DisplayNames pelo iso2", () => {
    const t = (_k: string, o: { defaultValue: string }) => o.defaultValue;
    expect(countryDisplayName(C("Germany", "DE", "Europe"), "pt-BR", t)).toBe("Alemanha");
    expect(countryDisplayName(C("Germany", "DE", "Europe"), "en", t)).toBe("Germany");
  });
  test("England continua England em en (iso GB seria United Kingdom)", () => {
    const t = (_k: string, o: { defaultValue: string }) => o.defaultValue;
    expect(countryDisplayName(C("England", "GB", "Europe", "england"), "en", t)).toBe("England");
  });
});

describe("leagueLabel / competitionName", () => {
  const leagues = [L("premier_league", "Premier League", "England"), L("of_armenian_premier_league", "Premier League", "Armenia")];
  test("rótulo inclui o país para desambiguar", () => {
    expect(leagueLabel(leagues[1]!, "Armênia")).toBe("Premier League · Armênia");
  });
  test("competitionName resolve pelo slug e cai para título legível", () => {
    expect(competitionName("of_armenian_premier_league", leagues)).toBe("Premier League");
    expect(competitionName("of_unknown_cup", leagues)).toBe("Unknown Cup");
    expect(competitionName("brazil_serie_a", leagues)).toBe("Brazil Serie A");
  });
});

describe("groupCountriesByContinent", () => {
  test("agrupa na ordem fixa de continentes e ordena por nome exibido", () => {
    const countries = [C("Uruguay", "UY", "South America"), C("Albania", "AL", "Europe"), C("Brazil", "BR", "South America"), C("Fiji", "FJ", undefined)];
    const groups = groupCountriesByContinent(countries, (c) => c.name);
    expect(groups.map((g) => g.continent)).toEqual(["Europe", "South America", "Other"]);
    expect(groups[1]!.countries.map((c) => c.name)).toEqual(["Brazil", "Uruguay"]);
    expect(CONTINENT_ORDER[0]).toBe("Europe");
  });
});

describe("sortLeaguesForCountry", () => {
  test("mantém a ordem do leagueData (nível), filtrando pelo país", () => {
    const ls = [L("a", "A", "Italy"), L("b", "B", "Spain"), L("c", "C", "Italy")];
    expect(sortLeaguesForCountry(ls, "Italy").map((l) => l.slug)).toEqual(["a", "c"]);
  });
});

describe("continentI18nKey", () => {
  test("minúsculo com underscore no lugar do espaço", () => {
    expect(continentI18nKey("South America")).toBe("south_america");
    expect(continentI18nKey("Europe")).toBe("europe");
    expect(continentI18nKey("Other")).toBe("other");
  });
});

describe("matchesCountryQuery", () => {
  test("query vazia sempre bate", () => {
    expect(matchesCountryQuery("", ["Qualquer coisa"])).toBe(true);
    expect(matchesCountryQuery("   ", ["Qualquer coisa"])).toBe(true);
  });
  test("bate sem diferenciar maiúsculas e ignorando acento", () => {
    expect(matchesCountryQuery("alem", ["Alemanha"])).toBe(true);
    expect(matchesCountryQuery("europa", ["Brasil", "América do Sul", "Europa"])).toBe(true);
    expect(matchesCountryQuery("sao", ["São Paulo"])).toBe(true);
    expect(matchesCountryQuery("ARG", ["Argentina"])).toBe(true);
  });
  test("não bate quando nenhuma parte contém a query", () => {
    expect(matchesCountryQuery("xyz", ["Brasil", "América do Sul"])).toBe(false);
  });
});
