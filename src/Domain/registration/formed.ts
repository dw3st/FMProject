import type { PlayerHistoryRow, RosterPlayer } from "@/types/playerTypes";
import type { RegistrationRule } from "@/types/registrationTypes";
import { DOMESTIC_EXTRA, FORMED_MAX_AGE, FORMED_SEASONS } from "@/Domain/registration/registrationConfig";
import { inGroup, normalizeNation } from "@/Domain/registration/nations";

/**
 * Formed at the club / in the country, foreign and free players (`.claude/rules/game/registration.md` → Definições).
 * The world only has history since the career started: a nation counted as domestic stands in for "trained in the
 * country" before that.
 */
export interface FormedCtx {
  /** Start year of the competition season being registered (2026 for "2026-27", 2027 for "2027"). */
  seasonStartYear: number;
  /** Country of a league slug ("" unknown). */
  countryOfLeague: (leagueSlug: string) => string;
}

const startYear = (season: string) => parseInt(season.slice(0, 4), 10);

/** Distinct seasons of `history` in which the player was ≤ FORMED_MAX_AGE at a club accepted by `atClub`. */
function formativeSeasons(p: RosterPlayer, ctx: FormedCtx, atClub: (row: PlayerHistoryRow) => boolean): number {
  const seasons = new Set<string>();
  for (const r of p.history ?? []) {
    const y = startYear(r.season);
    if (!Number.isFinite(y)) continue;
    const ageThen = p.age - (ctx.seasonStartYear - y);
    if (ageThen <= FORMED_MAX_AGE && atClub(r)) seasons.add(r.season);
  }
  return seasons.size;
}

/** Came out of the club's academy (id or `academyOf`), or ≥ 3 seasons there up to 21. */
export function clubTrained(p: RosterPlayer, squadId: string, ctx: FormedCtx): boolean {
  if (p.id.startsWith(`youth_${squadId}_`) || p.id.startsWith(`es_youth_${squadId}_`) || p.academyOf === squadId) return true;
  return formativeSeasons(p, ctx, (r) => r.squadId === squadId) >= FORMED_SEASONS;
}

/** Domestic nations of a rule in a country: the country, the rule's extra nations and the country's extras. */
export function domesticNations(rule: RegistrationRule | undefined, country: string): string[] {
  return [country, ...(rule?.domestic ?? []), ...(DOMESTIC_EXTRA[country] ?? [])];
}

/** Trained in the country: domestic (or unknown) nation, or ≥ 3 seasons at clubs of the country up to 21. */
export function nationTrained(p: RosterPlayer, country: string, ctx: FormedCtx, extra: string[]): boolean {
  const n = normalizeNation(p.nationality);
  if (!n || n === country || extra.includes(n)) return true;
  return formativeSeasons(p, ctx, (r) => ctx.countryOfLeague(r.league) === country) >= FORMED_SEASONS;
}

/** Formed under the rule: at the club or in the country (one minimum, no 4 + 4 split). */
export function isFormed(p: RosterPlayer, rule: RegistrationRule, country: string, squadId: string, ctx: FormedCtx): boolean {
  return clubTrained(p, squadId, ctx) || nationTrained(p, country, ctx, domesticNations(rule, country));
}

/** Foreign under the rule. An unknown nationality is domestic (missing data never drops a player). */
export function isForeign(p: RosterPlayer, rule: RegistrationRule, country: string): boolean {
  const n = normalizeNation(p.nationality);
  if (!n) return false;
  if (domesticNations(rule, country).includes(n)) return false;
  if (rule.foreign === "nonEU") {
    if (inGroup(n, "EU")) return false;
    if ((rule.exempt ?? []).some((g) => inGroup(n, g))) return false;
  }
  return true;
}

/** Free (list B): always registered, takes no place, may enter even with the deadline closed. */
export function isFree(p: RosterPlayer, rule: RegistrationRule, country: string, squadId: string, ctx: FormedCtx): boolean {
  if (!rule.free || p.age > rule.free.maxAge) return false;
  return !rule.free.formedOnly || isFormed(p, rule, country, squadId, ctx);
}
