import type { RosterPlayer } from "@/types/playerTypes";
import { addDays } from "@/Domain/dates";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { clamp } from "@/Domain/math";
import { DOMESTIC_EXTRA, FORMED_SEASONS } from "@/Domain/registration/registrationConfig";
import { formativeSeasons, nationsOf, type FormedCtx } from "@/Domain/registration/formed";
import { personalityOf, traitT } from "@/Domain/personality/personality";
import { NATURALIZATION as N } from "@/Domain/naturalization/naturalizationConfig";

/**
 * Naturalization (`.claude/rules/game/naturalization.md`): a foreign player living for years in the club's country,
 * or formed there, may ask for its nationality. Pure: requirements, interest, the draws and the process.
 */

export interface NaturalizationCtx extends FormedCtx {
  /** Country of a club ("" unknown): the academy the player came out of. */
  countryOfClub: (squadId: string) => string;
}

export type NaturalizationPath = "residence" | "formed";

const startYear = (season: string) => parseInt(season.slice(0, 4), 10);

/** Same nation as the country, counting its extra domestic nations (Wales in England). */
function isOfCountry(nation: string, country: string): boolean {
  return nation === country || (DOMESTIC_EXTRA[country] ?? []).includes(nation);
}

/** His nationality is from outside the country (an unknown one never asks). */
export function foreignToCountry(p: RosterPlayer, country: string): boolean {
  const ns = nationsOf(p);
  return ns.length > 0 && !ns.some((n) => isOfCountry(n, country));
}

/** Capped for a senior national team: tied to it for good (FIFA). */
export function tiedToNation(p: Pick<RosterPlayer, "national">): boolean {
  return (p.national?.caps ?? 0) > 0;
}

/**
 * Consecutive seasons at clubs of the country, ending with the most recent one: history rows (loans included) and the
 * season in progress when he is at a club of the country and it has started for him. A season abroad breaks it.
 */
export function residenceSeasons(p: RosterPlayer, country: string, ctx: FormedCtx, inCountryNow: boolean): number {
  const inside = new Set<number>();
  const all = new Set<number>();
  for (const r of p.history ?? []) {
    const y = startYear(r.season);
    if (!Number.isFinite(y)) continue;
    all.add(y);
    if (ctx.countryOfLeague(r.league) === country) inside.add(y);
  }
  const log = p.seasonLog;
  const started = !!log && ((log.appearances ?? 0) > 0 || (log.trainingSessions ?? 0) > 0);
  if (inCountryNow && started) { all.add(ctx.seasonStartYear); inside.add(ctx.seasonStartYear); }
  const years = [...all].sort((a, b) => b - a);
  let streak = 0;
  let expect: number | null = null;
  for (const y of years) {
    if (expect !== null && y !== expect) break;
    if (!inside.has(y)) break;
    streak++;
    expect = y - 1;
  }
  return streak;
}

const ACADEMY_ID = /^(?:es_)?youth_(.+?)_/;

/** Formed in the country: out of the academy of one of its clubs, or 3 seasons at its clubs up to 21. */
export function formedInCountry(p: RosterPlayer, country: string, ctx: NaturalizationCtx): boolean {
  const academy = p.academyOf ?? ACADEMY_ID.exec(p.id)?.[1];
  if (academy && ctx.countryOfClub(academy) === country) return true;
  return formativeSeasons(p, ctx, (r) => ctx.countryOfLeague(r.league) === country) >= FORMED_SEASONS;
}

/** The path that lets him ask, or null. */
export function naturalizationPath(p: RosterPlayer, country: string, ctx: NaturalizationCtx, inCountryNow = true): NaturalizationPath | null {
  if (residenceSeasons(p, country, ctx, inCountryNow) >= N.RESIDENCE_SEASONS) return "residence";
  if (p.age >= N.FORMED_MIN_AGE && formedInCountry(p, country, ctx)) return "formed";
  return null;
}

/** Every requirement to ask for the nationality of `country` (the country of his club). */
export function canAskNaturalization(p: RosterPlayer, country: string, ctx: NaturalizationCtx): NaturalizationPath | null {
  if (!country || !foreignToCountry(p, country)) return null;
  if (p.secondNationality || p.naturalization || tiedToNation(p)) return null;
  return naturalizationPath(p, country, ctx);
}

/** Chance he asks this season (0.05..0.85). `newPlace` / `originPlace`: in the 23 of that national team today. */
export function naturalizationChance(p: RosterPlayer, newPlace: boolean, originPlace: boolean): number {
  const loyalty = traitT(personalityOf(p).loyalty);
  const c = N.BASE + N.LOYALTY * loyalty + (newPlace ? N.NEW_PLACE : 0) - (originPlace ? N.ORIGIN_PLACE : 0);
  return clamp(c, N.MIN_CHANCE, N.MAX_CHANCE);
}

/** The season's draw: does he ask? Fixed per player and year. */
export function asksNaturalization(playerId: string, year: number, chance: number): boolean {
  return mulberry32(seedFrom(`natur:${playerId}:${year}`))() < chance;
}

/** Length of the process (90..180 days), fixed per player and year. */
export function processDays(playerId: string, year: number): number {
  const r = mulberry32(seedFrom(`natur-days:${playerId}:${year}`))();
  return N.PROCESS_MIN_DAYS + Math.floor(r * (N.PROCESS_MAX_DAYS - N.PROCESS_MIN_DAYS + 1));
}

/** The process starts today. */
export function startNaturalization(p: RosterPlayer, country: string, date: string, year: number): RosterPlayer {
  return { ...p, naturalization: { country, since: date, until: addDays(date, processDays(p.id, year)) } };
}

export type NaturalizationDayOutcome = "none" | "done" | "dropped";

/**
 * The process on a day: it ends on `until` (the second nationality); it falls when his club is no longer of the
 * country. The same player object back when nothing happens.
 */
export function naturalizationDay(p: RosterPlayer, date: string, clubCountry: string): { player: RosterPlayer; outcome: NaturalizationDayOutcome } {
  const n = p.naturalization;
  if (!n) return { player: p, outcome: "none" };
  const { naturalization: _n, ...rest } = p;
  if (clubCountry && clubCountry !== n.country) return { player: rest, outcome: "dropped" };
  if (date < n.until) return { player: p, outcome: "none" };
  return { player: { ...rest, secondNationality: n.country }, outcome: "done" };
}

/** The senior national teams he can play for: the one he is capped for, else his nationality and the second one. */
export function candidateNations(p: Pick<RosterPlayer, "nationality" | "secondNationality" | "national">): string[] {
  if (tiedToNation(p) && p.national) return [p.national.nation];
  return nationsOf(p);
}
