import { SCOUTING } from "@/Domain/scouting/scoutingConfig";
import { clamp } from "@/Domain/math";
import { daysBetween } from "@/Domain/dates";
import type { CountryKnowledgeEntry, StaffMember, StaffRole } from "@/types/staffTypes";
import countriesRaw from "@/Data/countries.json";

/**
 * Country knowledge of each scout (`.claude/rules/game/scouting.md` → "Conhecimento por país"). Pure.
 * Starts from the nationality (own 90, same continent 40, rest 0), grows with missions, decays slowly
 * after 180 idle days (never below the base; the own country never falls).
 */

const C = SCOUTING.COUNTRY;
const COUNTRIES = countriesRaw as Record<string, { continent?: string }>;
const continentOf = (country: string) => COUNTRIES[country]?.continent;

export type CountryBand = "full" | "moderate" | "none";
type Scout = Pick<StaffMember, "nationality" | "countryKnowledge">;

export const isScoutRole = (role: StaffRole) => role === "scout" || role === "fieldScout";

export function baseCountryKnowledge(nationality: string, country: string): number {
  if (!nationality || !country) return C.OTHER;
  if (country === nationality) return C.NATIVE;
  const a = continentOf(nationality);
  return a && a === continentOf(country) ? C.CONTINENT : C.OTHER;
}

/** Effective knowledge on `date`: the stored value decayed after the grace, never below the base; own country never falls. */
export function countryKnowledgeOf(scout: Scout, country: string, date: string): number {
  const base = baseCountryKnowledge(scout.nationality, country);
  const e = scout.countryKnowledge?.[country];
  if (!e) return base;
  if (country === scout.nationality) return Math.max(base, e.k);
  const idle = Math.max(0, daysBetween(e.last, date) - C.DECAY_GRACE_DAYS);
  return Math.round(Math.max(base, e.k - (C.DECAY_PER_30_DAYS * idle) / 30) * 10) / 10;
}

function curve(k: number, [atZero, atNeutral, atMax]: readonly [number, number, number]): number {
  const x = clamp(k, 0, 100);
  if (x === C.NEUTRAL) return atNeutral;
  if (x < C.NEUTRAL) return atZero + (atNeutral - atZero) * (x / C.NEUTRAL);
  return atNeutral + (atMax - atNeutral) * ((x - C.NEUTRAL) / (100 - C.NEUTRAL));
}
/** Multiplier on the knowledge a mission observation gains (1 at the neutral 40). */
export const countryGainMult = (k: number) => curve(k, C.GAIN_MULT);
/** Multiplier on a mission report's uncertainty (1 at the neutral 40). */
export const countryNoiseMult = (k: number) => curve(k, C.NOISE_MULT);

export const countryBand = (k: number): CountryBand =>
  (k >= C.BANDS.full ? "full" : k >= C.BANDS.moderate ? "moderate" : "none");

/** One worked week: each visited country learns `rate` of its gap to 100 (from the effective value). */
export function growCountryKnowledge(
  scout: Scout, visits: { country: string; rate: number }[], date: string,
): Record<string, CountryKnowledgeEntry> {
  const out = { ...(scout.countryKnowledge ?? {}) };
  for (const v of visits) {
    if (!v.country || v.rate <= 0) continue;
    const cur = countryKnowledgeOf({ ...scout, countryKnowledge: out }, v.country, date);
    out[v.country] = { k: Math.round(Math.min(100, cur + (100 - cur) * v.rate) * 10) / 10, last: date };
  }
  return out;
}

/** Entries that decayed down to the base leave (nothing to remember). */
export function pruneCountryKnowledge(scout: Scout, date: string): Record<string, CountryKnowledgeEntry> {
  return Object.fromEntries(Object.entries(scout.countryKnowledge ?? {})
    .filter(([c]) => countryKnowledgeOf(scout, c, date) > baseCountryKnowledge(scout.nationality, c)));
}

/** Best country (tie: the nationality, then name). */
export function strongCountry(scout: Scout, date: string): { country: string; k: number } {
  let best = { country: scout.nationality, k: baseCountryKnowledge(scout.nationality, scout.nationality) };
  for (const c of Object.keys(scout.countryKnowledge ?? {}).sort()) {
    const k = countryKnowledgeOf(scout, c, date);
    if (k > best.k) best = { country: c, k };
  }
  return { country: best.country, k: Math.round(best.k) };
}

/** Effective knowledge of every game country (> 0), rounded. */
export function countryKnowledgeMap(
  scout: Scout, date: string, countries: string[] = Object.keys(COUNTRIES),
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of countries) {
    const k = Math.round(countryKnowledgeOf(scout, c, date));
    if (k > 0) out[c] = k;
  }
  return out;
}

/** Mean knowledge over `countries` (a continent mission's countries). */
export function meanKnowledge(scout: Scout, countries: string[], date: string): number {
  if (countries.length === 0) return 0;
  return Math.round(countries.reduce((s, c) => s + countryKnowledgeOf(scout, c, date), 0) / countries.length);
}
