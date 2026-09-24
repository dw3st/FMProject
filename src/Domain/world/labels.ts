import type { LeagueData } from "@/types/playerTypes";
import type { Continent, CountryEntry } from "@/types/worldTypes";

export const CONTINENT_ORDER: Continent[] = ["Europe", "South America", "North America", "Asia", "Africa", "Oceania", "Other"];

type TFn = (key: string, opts: { defaultValue: string }) => string;

/** One `Intl.DisplayNames` instance per language — construction is relatively expensive and this
 *  is called for every country in every render of the country picker. */
const displayNamesByLang = new Map<string, Intl.DisplayNames>();

function regionDisplayNames(lang: string): Intl.DisplayNames | null {
  const cached = displayNamesByLang.get(lang);
  if (cached) return cached;
  try {
    const instance = new Intl.DisplayNames([lang], { type: "region" });
    displayNamesByLang.set(lang, instance);
    return instance;
  } catch {
    return null;
  }
}

/** i18n key first (curated names/headlines), then Intl.DisplayNames by ISO, then the raw English name. */
export function countryDisplayName(country: CountryEntry, lang: string, t: TFn): string {
  let fallback = country.name;
  // GB maps to "United Kingdom" in Intl — the game's country is England; only translate non-GB codes.
  if (country.iso2 && country.iso2.toUpperCase() !== "GB") {
    try {
      fallback = regionDisplayNames(lang)?.of(country.iso2.toUpperCase()) ?? country.name;
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
export function leaguesOfCountry(leagues: LeagueData[], countryName: string): LeagueData[] {
  return leagues.filter((l) => l.country === countryName);
}

/**
 * Splits day matches into the player's own league + followed leagues (primary) vs. the rest
 * (others). `isOwnMatch`, when given, forces a match into `primary` regardless of its
 * competition slug — used so the user's own match is never hidden under "others" when the
 * session's league slug is missing or stale.
 */
export function partitionDayMatches<T extends { competition: string }>(
  matches: T[], ownLeague: string, followed: string[], isOwnMatch?: (match: T) => boolean,
): { primary: T[]; others: T[] } {
  const keep = new Set([ownLeague, ...followed]);
  const isPrimary = (m: T) => keep.has(m.competition) || !!isOwnMatch?.(m);
  return {
    primary: matches.filter(isPrimary),
    others: matches.filter((m) => !isPrimary(m)),
  };
}

/**
 * squadId → slug of the league where the club appears in the static `leagueData` catalog.
 * Crest files live under `Data/logos/{origin league}/`, so logo URLs must use this origin league
 * — never the club's current (per-save) league, which can differ once clubs move between leagues.
 * First occurrence wins.
 */
export function catalogLeagueBySquadId(leagues: LeagueData[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const league of leagues) {
    for (const row of league.standings) {
      if (!m.has(row.squadId)) m.set(row.squadId, league.slug);
    }
  }
  return m;
}
