import type { LeagueData } from "@/types/playerTypes";
import type { Continent, CountryEntry } from "@/types/worldTypes";

export const CONTINENT_ORDER: Continent[] = ["Europe", "South America", "North America", "Asia", "Africa", "Oceania", "Other"];

type TFn = (key: string, opts: { defaultValue: string }) => string;

/** i18n key first (curated names/headlines), then Intl.DisplayNames by ISO, then the raw English name. */
export function countryDisplayName(country: CountryEntry, lang: string, t: TFn): string {
  let fallback = country.name;
  // GB maps to "United Kingdom" in Intl — the game's country is England; only translate non-GB codes.
  if (country.iso2 && country.iso2.toUpperCase() !== "GB") {
    try {
      fallback = new Intl.DisplayNames([lang], { type: "region" }).of(country.iso2.toUpperCase()) ?? country.name;
    } catch {
      fallback = country.name;
    }
  }
  return t(`newGame.countries.${country.slug}.name`, { defaultValue: fallback });
}

export function leagueLabel(league: LeagueData, countryName: string): string {
  return `${league.name} · ${countryName}`;
}

const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function competitionName(slug: string, leagues: LeagueData[]): string {
  const hit = leagues.find((l) => l.slug === slug);
  if (hit) return hit.name;
  return titleCase(slug.replace(/^of_/, ""));
}

/** i18n key segment for a continent, e.g. "South America" → "south_america". */
export function continentI18nKey(continent: Continent): string {
  return continent.toLowerCase().replace(/\s+/g, "_");
}

function normalizeForSearch(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Case- and accent-insensitive match: query matches if any part contains it. Empty query always matches. */
export function matchesCountryQuery(query: string, parts: string[]): boolean {
  const q = normalizeForSearch(query.trim());
  if (!q) return true;
  return parts.some((p) => normalizeForSearch(p).includes(q));
}

export interface ContinentGroup { continent: Continent; countries: CountryEntry[] }

export function groupCountriesByContinent(countries: CountryEntry[], displayName: (c: CountryEntry) => string): ContinentGroup[] {
  const buckets = new Map<Continent, CountryEntry[]>();
  for (const c of countries) {
    const k = c.continent ?? "Other";
    buckets.set(k, [...(buckets.get(k) ?? []), c]);
  }
  return CONTINENT_ORDER.filter((k) => buckets.has(k)).map((continent) => ({
    continent,
    countries: [...buckets.get(continent)!].sort((a, b) => displayName(a).localeCompare(displayName(b))),
  }));
}

/** leagueData is already written country → tier by the importer; keep that order. */
export function sortLeaguesForCountry(leagues: LeagueData[], countryName: string): LeagueData[] {
  return leagues.filter((l) => l.country === countryName);
}
