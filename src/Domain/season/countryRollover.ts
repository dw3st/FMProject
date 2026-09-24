import { addOneDay } from "@/Domain/advanceDay/date";
import { countryReadyForTransition, planPromotionRelegation } from "@/Domain/season/promotionRelegation";
import type { ClubMove, CountryPyramid, Pyramids } from "@/types/pyramidTypes";
import type { StandingRow } from "@/types/playerTypes";

/**
 * Season rollover is decided per COUNTRY: no league of a pyramid country rolls before the last one
 * of that country has ended; then they all roll together and clubs change division in between.
 * Leagues outside any pyramid (single-level countries, or a league the pyramid does not list) roll
 * alone, the day after their own end, as before.
 *
 * Both functions here are pure; `advanceOneDay` does the I/O around them.
 */

export interface RolloverLeagueState { leagueSlug: string; year: number; end: string }

export interface RolloverUnit {
  /** Pyramid country, or null for a league that rolls alone. */
  country: string | null;
  pyramid: CountryPyramid | null;
  /** Leagues to archive/reset/re-calendar in this unit (activeLeagues order). */
  leagues: string[];
  /**
   * Some leagues of this country were already rolled on disk (a previous attempt at this day
   * flushed part of its writes). Those are resynced, the rest roll WITHOUT promotion/relegation,
   * since the final tables of the already-rolled leagues are gone.
   */
  partial: boolean;
}

export interface DueRollovers {
  units: RolloverUnit[];
  /**
   * Ended leagues whose on-disk calendar is already the next season (stored league meta year >
   * state year): the rollover happened but `meta.activeLeagues` was not persisted. Only the state
   * is caught up from the league meta; nothing is rolled again.
   */
  resync: string[];
  /** Ended leagues waiting for the rest of their country to end. No games until then. */
  waiting: string[];
}

/** League slug → its pyramid (only leagues a pyramid lists). */
export function pyramidByLeague(pyramids: Pyramids): Map<string, CountryPyramid> {
  const out = new Map<string, CountryPyramid>();
  for (const p of Object.values(pyramids))
    for (const lv of p.levels) for (const g of lv.groups) out.set(g.leagueSlug, p);
  return out;
}

export function pyramidLeagueSlugs(pyramid: CountryPyramid): string[] {
  return pyramid.levels.flatMap((lv) => lv.groups.map((g) => g.leagueSlug));
}

export function tierOfLeague(pyramid: CountryPyramid, leagueSlug: string): number | null {
  for (const lv of pyramid.levels) if (lv.groups.some((g) => g.leagueSlug === leagueSlug)) return lv.tier;
  return null;
}

/**
 * Which leagues roll over after the day `date` has been played.
 *
 * A league has ended when `addOneDay(date) > end` (advanceDay's own check). The idempotency marker
 * is the league's state itself: a rollover writes next season's `year`/`end` into activeLeagues, so
 * a rolled league is no longer "ended". `storedYear` (year of the league meta on disk) additionally
 * catches a rollover whose other writes landed but whose save meta did not.
 */
export function findDueRollovers(args: {
  date: string;
  activeLeagues: RolloverLeagueState[];
  pyramids: Pyramids;
  storedYear: Record<string, number | undefined>;
}): DueRollovers {
  const { date, activeLeagues, pyramids, storedYear } = args;
  const nextDate = addOneDay(date);
  const byLeague = pyramidByLeague(pyramids);

  const ended = activeLeagues.filter((l) => nextDate > l.end);
  const isRolledOnDisk = (l: RolloverLeagueState) => (storedYear[l.leagueSlug] ?? l.year) > l.year;
  const resync = ended.filter(isRolledOnDisk).map((l) => l.leagueSlug);
  const pending = ended.filter((l) => !isRolledOnDisk(l));

  const units: RolloverUnit[] = [];
  const waiting: string[] = [];
  const seenCountry = new Set<string>();

  for (const l of pending) {
    const pyramid = byLeague.get(l.leagueSlug);
    if (!pyramid) {
      units.push({ country: null, pyramid: null, leagues: [l.leagueSlug], partial: false });
      continue;
    }
    if (seenCountry.has(pyramid.country)) continue;
    seenCountry.add(pyramid.country);
    const countrySlugs = pyramidLeagueSlugs(pyramid);
    const mine = pending.filter((p) => countrySlugs.includes(p.leagueSlug)).map((p) => p.leagueSlug);
    if (!countryReadyForTransition(countrySlugs, activeLeagues, date)) {
      waiting.push(...mine);
      continue;
    }
    units.push({
      country: pyramid.country,
      pyramid,
      leagues: mine,
      partial: resync.some((s) => countrySlugs.includes(s)),
    });
  }
  return { units, resync, waiting };
}

export interface CountryRolloverPlan {
  moves: ClubMove[];
  /** The human club's move, if it changed division. */
  playerMove: ClubMove | null;
  /** League the human club won (finished first, with games played), if any. */
  playerChampionOf: string | null;
  /** Tier change per moved club (for the income multiplier). */
  tierChanges: Record<string, { from: number; to: number }>;
  /** Expected club ids per league for next season (old table − leaving + arriving). */
  nextMembership: Record<string, string[]>;
}

/**
 * Plan one unit's rollover from the FINAL standings of its leagues (computed on the old
 * membership). Moves come from `planPromotionRelegation`; a unit without a pyramid or a partial
 * unit moves nobody.
 */
export function planCountryRollover(
  unit: RolloverUnit,
  standings: Record<string, StandingRow[]>,
  playerSquadId: string | undefined,
): CountryRolloverPlan {
  const own: Record<string, StandingRow[]> = {};
  for (const slug of unit.leagues) own[slug] = standings[slug] ?? [];

  const moves = unit.pyramid && !unit.partial ? planPromotionRelegation(unit.pyramid, own) : [];

  const tierChanges: CountryRolloverPlan["tierChanges"] = {};
  for (const m of moves) {
    const from = tierOfLeague(unit.pyramid!, m.from);
    const to = tierOfLeague(unit.pyramid!, m.to);
    if (from !== null && to !== null) tierChanges[m.squadId] = { from, to };
  }

  const nextMembership: Record<string, string[]> = {};
  const leavingIds = new Set(moves.map((m) => m.squadId));
  for (const slug of unit.leagues) {
    const stay = own[slug]!.map((r) => r.squadId).filter((id) => !leavingIds.has(id));
    const arrive = moves.filter((m) => m.to === slug).map((m) => m.squadId);
    nextMembership[slug] = [...stay, ...arrive];
  }

  const playerMove = playerSquadId ? moves.find((m) => m.squadId === playerSquadId) ?? null : null;
  const playerChampionOf = playerSquadId
    ? unit.leagues.find((slug) => own[slug]![0]?.squadId === playerSquadId && (own[slug]![0]!.mp ?? 0) > 0) ?? null
    : null;

  return { moves, playerMove, playerChampionOf, tierChanges, nextMembership };
}
