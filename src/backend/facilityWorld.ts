import type { SaveMeta, SaveService } from "@/backend/SaveService";
import { getLeagueData, getPyramids } from "@/backend/advanceDay";
import { createManagerTracker } from "@/backend/managerWorld";
import { tierOfLeague } from "@/Domain/season/countryRollover";
import { initialFacilities, seatCost, withFacilities } from "@/Domain/facilities/facilities";
import { MANAGERS } from "@/Domain/managers/managerConfig";
import type { Squad } from "@/types/playerTypes";

/**
 * Facilities I/O helpers (`.claude/rules/game/facilities.md`): the league tier of a club's league
 * and the cost per seat by country (the manager ranking's country weight) and league tier.
 */

/** Pyramid tier of a league (1 when the country has no pyramid or the league is not in it). */
export async function leagueTierOf(leagueSlug: string): Promise<number> {
  const catalog = await getLeagueData();
  const country = catalog.find((l) => l.slug === leagueSlug)?.country;
  const pyramid = country ? (await getPyramids())[country] : undefined;
  return (pyramid ? tierOfLeague(pyramid, leagueSlug) : null) ?? 1;
}

/** The squad with freshly set-up facilities (human club: career start or taking over a club). */
export async function withInitialFacilities(squad: Squad, leagueSlug: string): Promise<Squad> {
  return withFacilities(squad, initialFacilities(squad, await leagueTierOf(leagueSlug)));
}

// Country weights are expensive the first time (tier-1 levels of the country and the big 5): kept
// per process, keyed by save + country. The manager ranking's cache in the meta is used first.
const weightCache = new Map<string, number>();

async function countryWeightOf(service: SaveService, saveId: string, meta: SaveMeta, country: string | null): Promise<number> {
  if (!country) return MANAGERS.WEIGHT_MIN;
  const cached = meta.managerWeights?.[country];
  if (cached) return cached.weight;
  const key = `${saveId}:${country}`;
  const memo = weightCache.get(key);
  if (memo !== undefined) return memo;
  const index = await service.getSquadIndex(saveId);
  const tracker = createManagerTracker({
    service, saveId, getIndex: () => index, catalog: getLeagueData, pyramids: getPyramids,
  });
  const weight = await tracker.weightOf(country, "facilities");
  weightCache.set(key, weight);
  return weight;
}

/** EUR per seat of a stand expansion for the club's league (country weight × league tier). */
export async function seatCostFor(service: SaveService, saveId: string, meta: SaveMeta, leagueSlug: string): Promise<number> {
  const catalog = await getLeagueData();
  const country = catalog.find((l) => l.slug === leagueSlug)?.country ?? null;
  return seatCost(await countryWeightOf(service, saveId, meta, country), await leagueTierOf(leagueSlug));
}
