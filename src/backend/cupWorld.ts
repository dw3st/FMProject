/**
 * National cups — save I/O. Pure logic lives in src/Domain/cups/.
 * A cup lives in leagues/cup_<country>/ like a league (meta, rounds, date-index; no standings)
 * and is NOT part of meta.activeLeagues.
 */
import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { LeagueCalendarResult, LeagueSeasonMeta } from "@/types/calendarTypes";
import type { Pyramids } from "@/types/pyramidTypes";
import type { LeagueDataEntry } from "@/backend/advanceDay";
import { pyramidByLeague, tierOfLeague } from "@/Domain/season/countryRollover";
import { cupSlugOf, isCupSlug } from "@/Domain/cups/cupIds";
import { generateCup } from "@/Domain/cups/generateCup";
import { cupChampion, drawNextStage } from "@/Domain/cups/cupProgress";
import type { CupEntrant } from "@/Domain/cups/cupDraw";

/** leagueSlug → country, from the leagueData catalog. */
export function countryByLeague(catalog: LeagueDataEntry[]): Map<string, string> {
  return new Map(catalog.filter((l) => l.country).map((l) => [l.slug, l.country!]));
}

/** Clubs of a country (membership from the save's squad index) with their tier (1 when unknown). */
export function countryClubs(
  country: string,
  index: SquadIndex,
  countryOf: Map<string, string>,
  pyramids: Pyramids,
): CupEntrant[] {
  const pyr = pyramidByLeague(pyramids);
  const out: CupEntrant[] = [];
  for (const league of index.leagues()) {
    if (isCupSlug(league) || countryOf.get(league) !== country) continue;
    const p = pyr.get(league);
    const tier = (p && tierOfLeague(p, league)) ?? 1;
    for (const t of index.inLeague(league)) out.push({ id: t.squadId, tier });
  }
  return out;
}

/** Dates on which any given league has a round. */
export async function leagueBusyDates(service: SaveService, saveId: string, leagues: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const slug of leagues) {
    const idx = await service.getDateIndex(saveId, slug);
    for (const d of Object.keys(idx ?? {})) out.add(d);
  }
  return out;
}

/** Write a generated cup (meta, every round file, date index). */
export async function writeCup(service: SaveService, saveId: string, cup: LeagueCalendarResult): Promise<void> {
  await service.writeLeagueMeta(saveId, cup.meta);
  for (const r of cup.rounds) await service.writeRound(saveId, cup.meta.leagueSlug, r.round, r);
  await service.writeDateIndex(saveId, cup.meta.leagueSlug, cup.dateIndex);
}

/** Generate and write one country's cup for a season. Returns the meta, or null (< 2 clubs). */
export async function createCountryCup(args: {
  service: SaveService;
  saveId: string;
  country: string;
  year: number;
  window: { start: string; end: string };
  index: SquadIndex;
  countryOf: Map<string, string>;
  pyramids: Pyramids;
}): Promise<LeagueSeasonMeta | null> {
  const clubs = countryClubs(args.country, args.index, args.countryOf, args.pyramids);
  const leagues = [...args.countryOf].filter(([, c]) => c === args.country).map(([s]) => s);
  const cup = generateCup({
    country: args.country,
    year: args.year,
    clubs,
    window: args.window,
    busyDates: await leagueBusyDates(args.service, args.saveId, leagues),
    seedKey: `${args.saveId}:${args.year}:${args.country}`,
  });
  if (!cup) return null;
  await writeCup(args.service, args.saveId, cup);
  return cup.meta;
}

/**
 * After a day's cup fixtures are written: draw the next stage of every cup whose stage `round`
 * just completed, and record the champion after the final. Returns what changed.
 */
export async function advanceCupStages(
  service: SaveService,
  saveId: string,
  playedRounds: Map<string, number[]>,
): Promise<Array<{ slug: string; drawnRound?: number; championId?: string }>> {
  const changes: Array<{ slug: string; drawnRound?: number; championId?: string }> = [];
  for (const [slug, rounds] of playedRounds) {
    if (!isCupSlug(slug)) continue;
    let meta = await service.getLeagueMeta(saveId, slug);
    if (!meta?.cup) continue;
    for (const round of rounds) {
      const fixtures = (await service.getRound(saveId, slug, round))?.fixtures ?? [];
      const next = drawNextStage(meta, round, fixtures, `${saveId}:${meta.year}:${meta.cup!.country}`);
      if (next) {
        meta = next.meta;
        await service.writeRound(saveId, slug, next.round.round, next.round);
        await service.writeLeagueMeta(saveId, meta);
        changes.push({ slug, drawnRound: next.round.round });
        continue;
      }
      const champ = cupChampion(meta, fixtures);
      if (champ && meta.cup!.championId !== champ) {
        meta = { ...meta, cup: { ...meta.cup!, championId: champ } };
        await service.writeLeagueMeta(saveId, meta);
        changes.push({ slug, championId: champ });
      }
    }
  }
  return changes;
}

export { cupSlugOf };
