import type { SeatMeta, SaveService } from "@/backend/SaveService";
import { getLeagueData, getPyramids } from "@/backend/advanceDay";
import { createManagerTracker } from "@/backend/managerWorld";
import { tierOfLeague } from "@/Domain/season/countryRollover";
import { initialFacilities, seatCost, withFacilities } from "@/Domain/facilities/facilities";
import { MANAGERS } from "@/Domain/managers/managerConfig";
import type { Squad } from "@/types/playerTypes";
import { readdir } from "fs/promises";
import { fileURLToPath } from "url";

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

const DATA_DIR = fileURLToPath(new URL("../Data", import.meta.url));

/** Annual income of a club (broadcasting + commercial, the natural-tier basis). */
const incomeOf = (squad: Squad): number => (squad.finances?.broadcasting ?? 0) + (squad.finances?.commercial ?? 0);

let worldIncomes: Promise<number[]> | null = null;

/** Sorted incomes of every club of the base world (`src/Data/squads`), read once per process. */
function loadWorldIncomes(): Promise<number[]> {
  worldIncomes ??= (async () => {
    const root = `${DATA_DIR}/squads`;
    const glob = new Bun.Glob("*.json");
    const out: number[] = [];
    for (const d of await readdir(root, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      for await (const f of glob.scan(`${root}/${d.name}`)) {
        out.push(incomeOf((await Bun.file(`${root}/${d.name}/${f}`).json()) as Squad));
      }
    }
    return out.sort((a, b) => a - b);
  })().catch((e) => {
    worldIncomes = null;
    throw e;
  });
  return worldIncomes;
}

/** Revenue percentile 0..1 of a club against the base world (ties count half). */
export async function revenuePercentileOf(squad: Squad): Promise<number> {
  const all = await loadWorldIncomes();
  if (all.length === 0) return 0.5;
  const x = incomeOf(squad);
  let below = 0;
  let equal = 0;
  for (const v of all) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return (below + equal / 2) / all.length;
}

/** A human club's starting facilities: league tier for the demand anchor, items by its revenue. */
export async function startingFacilities(squad: Squad, leagueSlug: string) {
  return initialFacilities(squad, await leagueTierOf(leagueSlug), await revenuePercentileOf(squad));
}

/** The squad with freshly set-up facilities (human club: career start or taking over a club). */
export async function withInitialFacilities(squad: Squad, leagueSlug: string): Promise<Squad> {
  return withFacilities(squad, await startingFacilities(squad, leagueSlug));
}

// Country weights are expensive the first time (tier-1 levels of the country and the big 5): kept
// per process, keyed by save + country + season (the levels change with the squads). The manager ranking's cache in the meta is used first.
const weightCache = new Map<string, number>();

async function countryWeightOf(
  service: SaveService, saveId: string, meta: SeatMeta, country: string | null, season: string,
): Promise<number> {
  if (!country) return MANAGERS.WEIGHT_MIN;
  const cached = meta.managerWeights?.[country];
  if (cached) return cached.weight;
  const key = `${saveId}:${country}:${season}`;
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
export async function seatCostFor(service: SaveService, saveId: string, meta: SeatMeta, leagueSlug: string): Promise<number> {
  const catalog = await getLeagueData();
  const country = catalog.find((l) => l.slug === leagueSlug)?.country ?? null;
  const year = (meta.activeLeagues ?? []).find((l) => l.leagueSlug === leagueSlug)?.year;
  const season = String(year ?? (meta.currentDate ?? "").slice(0, 4));
  return seatCost(await countryWeightOf(service, saveId, meta, country, season), await leagueTierOf(leagueSlug));
}
