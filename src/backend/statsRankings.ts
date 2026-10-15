import { saveService } from "@/backend/SaveService";
import { getSaveDataVersion } from "@/backend/dal/saveDataVersion";
import { getLeagueData } from "@/backend/advanceDay";
import { isCupSlug } from "@/Domain/cups/cupIds";
import { isContinentalSlug } from "@/Domain/continental/competitions";
import { ALL_COMPETITIONS, buildCompetitionRankings, type CompetitionKind, type CompetitionRankings } from "@/Domain/stats/rankings";

interface Entry { key: string; rankings: CompetitionRankings }

/** `saveId#competition` -> rankings for the day/version in `key`. Bounded so it cannot grow forever. */
const cache = new Map<string, Entry>();
const MAX_ENTRIES = 24;

/** Rankings for one competition slug (`all`, league, `cup_<country>` or continental); null for an unknown save/competition. */
export async function getCompetitionRankings(
  saveId: string,
  competition: string,
): Promise<CompetitionRankings | null | "not_found"> {
  const meta = await saveService.getMeta(saveId);
  if (!meta) return null;
  const key = `${meta.currentDate ?? ""}#${getSaveDataVersion(saveId)}`;
  const cacheKey = `${saveId}#${competition}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.key === key) return hit.rankings;

  const index = await saveService.getSquadIndex(saveId);
  let kind: CompetitionKind;
  let clubIds: Set<string>;
  if (competition === ALL_COMPETITIONS) {
    // Every league of the world: league-only numbers (total - cup - continental), like a single league.
    kind = "league";
    clubIds = new Set(index.leagues().filter((l) => !isCupSlug(l) && !isContinentalSlug(l))
      .flatMap((l) => index.inLeague(l).map((t) => t.squadId)));
  } else if (isContinentalSlug(competition)) {
    const lm = await saveService.getLeagueMeta(saveId, competition);
    if (!lm?.continental) return "not_found";
    kind = "continental";
    clubIds = new Set(lm.continental.groups.flatMap((g) => g.clubs));
  } else if (isCupSlug(competition)) {
    const catalog = await getLeagueData();
    const countryOf = new Map(catalog.filter((l) => l.country).map((l) => [l.slug, l.country!]));
    const cupMeta = await saveService.getLeagueMeta(saveId, competition);
    const country = cupMeta?.cup?.country;
    if (!country) return "not_found";
    kind = "cup";
    clubIds = new Set(
      index.leagues().filter((l) => !isCupSlug(l) && countryOf.get(l) === country)
        .flatMap((l) => index.inLeague(l).map((t) => t.squadId)),
    );
  } else {
    if (!index.leagues().includes(competition)) return "not_found";
    kind = "league";
    clubIds = new Set(index.inLeague(competition).map((t) => t.squadId));
  }

  const squads = await saveService.getAllSquads(saveId);
  const rankings = buildCompetitionRankings(squads, { kind, clubIds });
  cache.delete(cacheKey);
  cache.set(cacheKey, { key, rankings });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return rankings;
}
