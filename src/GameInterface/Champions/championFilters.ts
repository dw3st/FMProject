import { NATIONAL_ROW_KEYS, type ChampionRowSpec } from "@/Domain/champions/champions";
import { competitionsOf, CONTINENTAL_SLUGS } from "@/Domain/continental/competitions";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import { PUBLIC_WORLD } from "@/Domain/multiplayer/publicWorldConfig";
import { continentI18nKey, countryDisplayName, groupCountriesByContinent, leaguesOfCountry } from "@/Domain/world/labels";
import type { LeagueData } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export const MAIN_FILTER = "main";

export interface ChampionFilter {
  value: string;
  label: string;
  /** Header of the combobox: the continent the country belongs to. */
  group?: string;
  rows: ChampionRowSpec[];
}

/** The filter of the Champions board: main competitions, continental, national teams, each continent and each country. */
export function championFilters(
  leagues: LeagueData[],
  countryByName: ReadonlyMap<string, CountryEntry>,
  lang: string,
  t: TFn,
): ChampionFilter[] {
  const groupContinental = t("champions.groups.continental");
  const groupNational = t("champions.groups.national");
  const groupLeagues = t("champions.groups.leagues");
  const continental = CONTINENTAL_SLUGS.map((key): ChampionRowSpec => ({ key, group: groupContinental }));
  const national = NATIONAL_ROW_KEYS.map((key): ChampionRowSpec => ({ key, group: groupNational }));
  const known = new Set(leagues.map((l) => l.slug));

  const out: ChampionFilter[] = [
    {
      value: MAIN_FILTER,
      label: t("champions.filters.main"),
      rows: [...continental, ...national, ...PUBLIC_WORLD.LEAGUES.filter((s) => known.has(s)).map((key): ChampionRowSpec => ({ key, group: groupLeagues }))],
    },
    { value: "continental", label: groupContinental, rows: continental.map(({ key }) => ({ key })) },
    { value: "national", label: groupNational, rows: national.map(({ key }) => ({ key })) },
  ];

  const countries = [...new Set(leagues.map((l) => l.country).filter((c): c is string => !!c))].map(
    (name): CountryEntry => countryByName.get(name) ?? { slug: name, name, flag: "", iso2: "", playable: false, headline: "", continent: "Other" },
  );
  const displayName = (c: CountryEntry) => (c.iso2 ? countryDisplayName(c, lang, (k, o) => t(k, o)) : c.name);
  const countryRows = (c: CountryEntry, group?: string): ChampionRowSpec[] => [
    ...leaguesOfCountry(leagues, c.name).map((l) => ({ key: l.slug, ...(group ? { group } : {}) })),
    { key: cupSlugOf(c.name), ...(group ? { group } : {}) },
  ];

  for (const g of groupCountriesByContinent(countries, displayName)) {
    const continentName = t(`newGame.continents.${continentI18nKey(g.continent)}`, { defaultValue: g.continent });
    const own = g.continent === "Europe" || g.continent === "South America"
      ? competitionsOf(g.continent).map((c): ChampionRowSpec => ({ key: c.slug, group: groupContinental }))
      : [];
    out.push({
      value: `continent:${g.continent}`,
      label: continentName,
      group: t("champions.filters.continents"),
      rows: [...own, ...g.countries.flatMap((c) => countryRows(c, displayName(c)))],
    });
  }
  for (const g of groupCountriesByContinent(countries, displayName)) {
    const continentName = t(`newGame.continents.${continentI18nKey(g.continent)}`, { defaultValue: g.continent });
    for (const c of g.countries) {
      out.push({ value: `country:${c.name}`, label: displayName(c), group: continentName, rows: countryRows(c) });
    }
  }
  return out;
}
