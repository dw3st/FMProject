import type { SeedLeague } from "@/../scripts/openfootball/types";
import type { LeagueScheduleConfig } from "@/Domain/season/leagueScheduleConfig";

export const MIN_CLUBS = 8;

export const OVERLAP: Record<string, string> = {
  "premier-league": "premier_league",
  "bundesliga": "bundesliga",
  "spanish-first-division": "la_liga",
  "italian-serie-a": "serie_a",
  "ligue-1": "ligue_1",
  "brazilian-serie-a": "brazil_serie_a",
  "brazilian-serie-b": "brazil_serie_b",
};

export const CALENDAR_YEAR = new Set(["br", "ar", "cl", "uy", "py", "pe", "co", "ve", "us", "jp", "no", "se", "fi", "is", "kz", "by", "ge", "uz", "fj"]);

export const CONTINENT: Record<string, string> = {
  al: "Europe", am: "Europe", at: "Europe", be: "Europe", bg: "Europe", by: "Europe", ch: "Europe", cy: "Europe",
  cz: "Europe", de: "Europe", dk: "Europe", es: "Europe", fi: "Europe", fr: "Europe", gb: "Europe", ge: "Europe",
  gr: "Europe", hr: "Europe", hu: "Europe", is: "Europe", it: "Europe", mt: "Europe", nl: "Europe", no: "Europe",
  pl: "Europe", pt: "Europe", rs: "Europe", ru: "Europe", se: "Europe", si: "Europe", sk: "Europe", tr: "Europe",
  ua: "Europe", kz: "Asia", il: "Asia",
  ar: "South America", br: "South America", cl: "South America", co: "South America", pe: "South America",
  py: "South America", uy: "South America", ve: "South America",
  us: "North America", mx: "North America",
  ae: "Asia", id: "Asia", ir: "Asia", jp: "Asia", sa: "Asia", uz: "Asia",
  au: "Oceania", fj: "Oceania",
  cm: "Africa", dz: "Africa", eg: "Africa", gh: "Africa", ke: "Africa", ng: "Africa", za: "Africa",
};

export function keptLeagues(leagues: SeedLeague[], clubCounts: Map<string, number>): SeedLeague[] {
  return leagues.filter((l) => !(l.slug in OVERLAP) && (clubCounts.get(l.slug) ?? 0) >= MIN_CLUBS);
}

export interface Zone { id: string; label: string; color: string; from?: number; to?: number; fromEnd?: number }

export function zonesFor(o: { clubs: number; hasAbove: boolean; hasBelow: boolean }): Zone[] {
  const n = o.clubs >= 16 ? 3 : 2;
  const zones: Zone[] = [];
  if (o.hasAbove) zones.push({ id: "prom", label: "Promotion", color: "green", from: 1, to: n });
  if (o.hasBelow) zones.push({ id: "rel", label: "Relegation", color: "red", fromEnd: n });
  return zones;
}

export function scheduleFor(slug: string, countryCode: string, clubs: number, indexInCountry: number): LeagueScheduleConfig {
  const rounds = 2 * (clubs - 1 + (clubs % 2));
  const calendarYear = CALENDAR_YEAR.has(countryCode);
  return {
    slug,
    seasonStartMMDD: calendarYear ? "02-05" : "08-15",
    seasonEndMMDD: calendarYear ? "11-30" : "05-17",
    crossYear: !calendarYear,
    matchDays: rounds > 40 ? [3, 6, 0] : [6, 0],
    baseWeekOffset: indexInCountry % 5,
  };
}

export const seasonLabel = (countryCode: string) => (CALENDAR_YEAR.has(countryCode) ? "2025" : "2024-25");

export function buildCountryEntry(code: string, name: string) {
  return {
    slug: name.toLowerCase().replace(/\s+/g, "_"),
    name,
    flag: code === "gb" && name === "England" ? "gb-eng" : code,
    iso2: code.toUpperCase(),
    playable: true,
    continent: CONTINENT[code] ?? "Other",
    headline: `In ${name}, every match writes a new story.</br>Build your club and take on the league.`,
  };
}

/** Promotion/relegation flags for a league at `tier` given every tier present in its country. */
export function levelFlags(tier: number, countryTiers: number[]): { hasAbove: boolean; hasBelow: boolean } {
  return { hasAbove: countryTiers.some((t) => t < tier), hasBelow: countryTiers.some((t) => t > tier) };
}

/**
 * Serializes leagueSchedules.json in its hand-aligned one-entry-per-line style
 * (slug padded to 17, crossYear to 6, matchDays to 10), so the original TL lines stay byte-identical.
 */
export function formatSchedules(entries: LeagueScheduleConfig[]): string {
  const line = (e: LeagueScheduleConfig) =>
    `  { "slug": ${`${JSON.stringify(e.slug)},`.padEnd(17)} "seasonStartMMDD": ${JSON.stringify(e.seasonStartMMDD)}, ` +
    `"seasonEndMMDD": ${JSON.stringify(e.seasonEndMMDD)}, "crossYear": ${`${e.crossYear},`.padEnd(6)} ` +
    `"matchDays": ${`[${e.matchDays.join(", ")}],`.padEnd(10)} "baseWeekOffset": ${e.baseWeekOffset} }`;
  return `[\n${entries.map(line).join(",\n")}\n]\n`;
}
