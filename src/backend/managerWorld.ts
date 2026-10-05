import type { SaveService } from "@/backend/SaveService";
import type { SquadIndex } from "@/backend/squadIndex";
import type { LeagueDataEntry } from "@/backend/advanceDay";
import type { Pyramids } from "@/types/pyramidTypes";
import type { CountryWeight, ManagerRecord, ManagerTitle } from "@/types/managerTypes";
import { clubLevel, topLeagueOf } from "@/backend/continentalWorld";
import { MANAGERS } from "@/Domain/managers/managerConfig";
import { addSeason, awardTitle, countryWeight } from "@/Domain/managers/managers";
import { logError } from "@/Logger";

/**
 * Manager-ranking I/O for one advance-day (`.claude/rules/game/managers.md`): the ranking file is
 * read once on first use, titles/seasons are applied in memory and `flush` writes it back (into the
 * day's buffered DAL). Country weights are computed once per country per season and cached in the
 * save meta (`meta.managerWeights`, written by the caller from `weights()` when `weightsChanged()`).
 */
export function createManagerTracker(args: {
  service: SaveService;
  saveId: string;
  getIndex: () => SquadIndex;
  catalog: () => Promise<LeagueDataEntry[]>;
  pyramids: () => Promise<Pyramids>;
  /** Weights already computed this save (`meta.managerWeights`). */
  weights?: Record<string, CountryWeight>;
}) {
  const { service, saveId } = args;
  let managers: ManagerRecord[] | null = null;
  let changed = false;
  const levels = new Map<string, number | null>();
  let big5: number | null | undefined;
  let weights: Record<string, CountryWeight> = args.weights ?? {};
  let weightsChanged = false;

  const load = async (): Promise<ManagerRecord[]> => (managers ??= await service.getManagers(saveId));

  /** Average `clubLevel` of the country's tier-1 clubs, null when it has none. */
  const countryLevel = async (country: string): Promise<number | null> => {
    if (levels.has(country)) return levels.get(country)!;
    const top = topLeagueOf(country, await args.catalog(), await args.pyramids());
    const lv: number[] = [];
    for (const t of top ? args.getIndex().inLeague(top) : []) {
      const squad = await service.getSquadById(saveId, t.squadId);
      if (!squad) continue;
      try { lv.push(clubLevel(squad)); } catch { /* squad without a full XI: skipped */ }
    }
    const v = lv.length > 0 ? lv.reduce((a, b) => a + b, 0) / lv.length : null;
    levels.set(country, v);
    return v;
  };

  return {
    countryOfLeague: async (slug: string): Promise<string | null> =>
      (await args.catalog()).find((l) => l.slug === slug)?.country ?? null,

    /**
     * Tier-1 level of the country ÷ the big-5 average, clamped (`countryWeight`). Computed once per
     * country per season label, then served from the cache.
     */
    async weightOf(country: string | null, season: string): Promise<number> {
      if (!country) return MANAGERS.WEIGHT_MIN;
      const cached = weights[country];
      if (cached && cached.season === season) return cached.weight;
      if (big5 === undefined) {
        const vs: number[] = [];
        for (const c of MANAGERS.BIG5) {
          const v = await countryLevel(c);
          if (v !== null) vs.push(v);
        }
        big5 = vs.length > 0 ? vs.reduce((a, b) => a + b, 0) / vs.length : null;
      }
      const weight = countryWeight((await countryLevel(country)) ?? 0, big5 ?? 0);
      weights = { ...weights, [country]: { season, weight } };
      weightsChanged = true;
      return weight;
    },

    weights: () => weights,
    weightsChanged: () => weightsChanged,

    async credit(title: ManagerTitle): Promise<void> {
      const cur = await load();
      const next = awardTitle(cur, title);
      if (next !== cur) { managers = next; changed = true; }
      else if (!cur.some((m) => m.squadId === title.squadId)) {
        logError("managers", `save ${saveId}: no manager for club ${title.squadId}`, { title });
      }
    },

    async countSeason(squadId: string, season: string): Promise<void> {
      const cur = await load();
      const next = addSeason(cur, squadId, season);
      if (next !== cur) { managers = next; changed = true; }
    },

    /** Today's ranking (titles credited so far included). */
    list: (): Promise<ManagerRecord[]> => load(),

    /** Applies a change to the whole file (the human manager changing club, `.claude/rules/game/jobs.md`). */
    async apply(fn: (m: ManagerRecord[]) => ManagerRecord[]): Promise<void> {
      const cur = await load();
      const next = fn(cur);
      if (next !== cur) { managers = next; changed = true; }
    },

    async flush(): Promise<void> {
      if (changed && managers) await service.writeManagers(saveId, managers);
    },
  };
}
