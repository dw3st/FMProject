import type { CountryEntry } from "@/types/worldTypes";
import { COUNTRY_PATHS } from "@/GameInterface/NewGame/worldMapPaths";

/**
 * The game countries that can be drawn on the world map, keyed by ISO2. A country without a path
 * (none today — see `worldMapCountries.test.ts`) simply stays list-only.
 */
export function mappableCountries(countries: CountryEntry[]): Map<string, CountryEntry> {
  const byIso = new Map<string, CountryEntry>();
  for (const c of countries) {
    const iso = c.iso2.toUpperCase();
    if (COUNTRY_PATHS[iso]) byIso.set(iso, c);
  }
  return byIso;
}
