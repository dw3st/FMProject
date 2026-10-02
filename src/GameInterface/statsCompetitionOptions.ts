import type { LeagueData } from "@/types/playerTypes";
import type { CountryEntry } from "@/types/worldTypes";
import { ALL_COMPETITIONS } from "@/Domain/stats/rankings";
import { competitionsOf } from "@/Domain/continental/competitions";
import { cupSlugOf } from "@/Domain/cups/cupIds";
import {
  competitionName, continentI18nKey, countryDisplayName, groupCountriesByContinent, leagueLabel, leaguesOfCountry,
} from "@/Domain/world/labels";

type TFn = (key: string, opts?: { defaultValue: string }) => string;

export interface CompetitionOption { value: string; label: string; group?: string; subgroup?: string }

/**
 * Options of the Stats competition selector: "all leagues" first (the default), then grouped by
 * continent (its continental competitions first) -> country (its leagues by tier, then its cup).
 * Pure.
 */
export function statsCompetitionOptions(
  leagues: LeagueData[],
  countryByName: ReadonlyMap<string, CountryEntry>,
  lang: string,
  t: TFn,
): CompetitionOption[] {
  const out: CompetitionOption[] = [{ value: ALL_COMPETITIONS, label: t("statsScreen.allLeagues") }];
  const countryNames = [...new Set(leagues.map((l) => l.country).filter(Boolean))];
  const countries = countryNames.map(
    (name): CountryEntry => countryByName.get(name) ?? { slug: name, name, flag: "", iso2: "", playable: false, headline: "", continent: "Other" },
  );
  const displayName = (c: CountryEntry) => (c.iso2 ? countryDisplayName(c, lang, (k, o) => t(k, o)) : c.name);
  for (const group of groupCountriesByContinent(countries, displayName)) {
    const continentName = t(`newGame.continents.${continentI18nKey(group.continent)}`, { defaultValue: group.continent });
    if (group.continent === "Europe" || group.continent === "South America") {
      for (const c of competitionsOf(group.continent)) {
        out.push({ value: c.slug, label: competitionName(c.slug, leagues, lang), group: continentName });
      }
    }
    for (const country of group.countries) {
      const name = displayName(country);
      for (const l of leaguesOfCountry(leagues, country.name)) {
        out.push({ value: l.slug, label: leagueLabel(l, name), group: continentName, subgroup: name });
      }
      const cup = cupSlugOf(country.name);
      out.push({ value: cup, label: competitionName(cup, leagues, lang), group: continentName, subgroup: name });
    }
  }
  return out;
}
