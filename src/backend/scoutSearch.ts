import { fileURLToPath } from "node:url";
import { saveService } from "@/backend/SaveService";
import { getSaveDataVersion } from "@/backend/dal/saveDataVersion";
import {
  collectNationalities, collectSellListedIds, mapSquadsToScoutPlayers, runScoutQuery,
  type ScoutQuery, type ScoutSearchResponse,
} from "@/Domain/scout/scoutQuery";
import { createDefaultScoutFilters } from "@/GameInterface/Scout/scoutFilterState";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";

const DATA_DIR = fileURLToPath(new URL("../Data", import.meta.url));

interface ScoutIndex {
  key: string;
  players: DisplayPlayer[];
  nationalities: string[];
  sellListedIds: Set<string>;
}

/** One entry per save; a few saves at most so a long-running server does not grow unbounded. */
const MAX_CACHED_SAVES = 4;
const cache = new Map<string, ScoutIndex>();

async function leagueSlugs(): Promise<string[]> {
  const file = Bun.file(`${DATA_DIR}/leagueData.json`);
  if (!(await file.exists())) return [];
  const leagues = (await file.json()) as Array<{ slug: string }>;
  return Array.isArray(leagues) ? leagues.map((l) => l.slug) : [];
}

/**
 * Built scout rows for a save. Keyed by `currentDate` (advance-day rewrites squads) plus the
 * save's write version (bumped by FileSystemDAL on every squad/market write, so a mid-day
 * transfer or sell-list edit invalidates the entry).
 */
export async function getScoutIndex(saveId: string): Promise<ScoutIndex | null> {
  const meta = await saveService.getMeta(saveId);
  if (!meta) return null;
  // Read the version before loading so a write racing the build yields a newer key next time.
  const key = `${meta.currentDate ?? ""}#${getSaveDataVersion(saveId)}`;
  const hit = cache.get(saveId);
  if (hit && hit.key === key) {
    cache.delete(saveId);
    cache.set(saveId, hit);
    return hit;
  }

  const [squads, market, slugs] = await Promise.all([
    saveService.getAllSquads(saveId),
    saveService.getMarket(saveId),
    leagueSlugs(),
  ]);
  const players = mapSquadsToScoutPlayers(squads, slugs);
  const entry: ScoutIndex = {
    key,
    players,
    nationalities: collectNationalities(players),
    sellListedIds: new Set(collectSellListedIds(market)),
  };
  cache.delete(saveId);
  cache.set(saveId, entry);
  while (cache.size > MAX_CACHED_SAVES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return entry;
}

/** Normalise an untrusted request body into a full `ScoutQuery`. */
export function parseScoutQuery(body: unknown): ScoutQuery {
  const b = (body && typeof body === "object" ? body : {}) as Partial<ScoutQuery>;
  const defaults = createDefaultScoutFilters();
  const f = (b.filters && typeof b.filters === "object" ? b.filters : {}) as Partial<ScoutQuery["filters"]>;
  return {
    filters: {
      ...defaults,
      ...f,
      attributeRanges: { ...defaults.attributeRanges, ...(f.attributeRanges ?? {}) },
    },
    sortKey: typeof b.sortKey === "string" ? b.sortKey : "avg",
    sortDir: b.sortDir === "asc" ? "asc" : "desc",
    page: typeof b.page === "number" ? b.page : 0,
    pageSize: typeof b.pageSize === "number" ? b.pageSize : 100,
  };
}

export async function searchScout(saveId: string, query: ScoutQuery): Promise<ScoutSearchResponse | null> {
  const index = await getScoutIndex(saveId);
  if (!index) return null;
  const page = runScoutQuery(index.players, query, index.sellListedIds);
  return {
    ...page,
    nationalities: index.nationalities,
    sellListedIds: page.rows.filter((r) => index.sellListedIds.has(r.id)).map((r) => r.id),
  };
}
