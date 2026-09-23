import { fileURLToPath } from "node:url";
import { saveService } from "@/backend/SaveService";
import { getSaveDataVersion } from "@/backend/dal/saveDataVersion";
import {
  collectNationalities, collectSellListedIds, mapSquadsToScoutPlayers, runScoutQuery,
  type ScoutQuery, type ScoutSearchResponse,
} from "@/Domain/scout/scoutQuery";
import { ATTRIBUTE_LIST } from "@/GameInterface/AttributeLabels";
import { createDefaultScoutFilters } from "@/GameInterface/Scout/scoutFilterState";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";

const DATA_DIR = fileURLToPath(new URL("../Data", import.meta.url));

interface ScoutIndex {
  key: string;
  players: DisplayPlayer[];
  nationalities: string[];
  sellListedIds: Set<string>;
}

/** One entry per save; a couple of saves at most so a long-running server does not grow unbounded. */
const MAX_CACHED_SAVES = 2;
const cache = new Map<string, ScoutIndex>();

/**
 * In-flight index builds keyed by `saveId#key`, so concurrent misses (e.g. two scout requests
 * landing before the first build finishes) share one `getAllSquads` call instead of each
 * kicking off its own.
 */
const inFlight = new Map<string, Promise<ScoutIndex | null>>();

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
async function buildScoutIndex(saveId: string, key: string): Promise<ScoutIndex> {
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

  // Share one build across concurrent misses for the same save + key.
  const flightKey = `${saveId}#${key}`;
  const pending = inFlight.get(flightKey);
  if (pending) return pending;

  const promise = buildScoutIndex(saveId, key).finally(() => {
    inFlight.delete(flightKey);
  });
  inFlight.set(flightKey, promise);
  return promise;
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" ? v : fallback;
}

function asFiniteNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Coerce `attributeRanges` to only known attribute ids with finite, 0..10-clamped, min<=max bounds. */
function asAttributeRanges(
  raw: unknown,
  defaults: ScoutQuery["filters"]["attributeRanges"],
): ScoutQuery["filters"]["attributeRanges"] {
  const out = { ...defaults };
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const attr of ATTRIBUTE_LIST) {
    const entry = r[attr.id];
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { min?: unknown; max?: unknown };
    if (typeof e.min !== "number" || !Number.isFinite(e.min)) continue;
    if (typeof e.max !== "number" || !Number.isFinite(e.max)) continue;
    const clampedMin = Math.min(10, Math.max(0, e.min));
    const clampedMax = Math.min(10, Math.max(0, e.max));
    out[attr.id] = clampedMin <= clampedMax
      ? { min: clampedMin, max: clampedMax }
      : { min: clampedMax, max: clampedMin };
  }
  return out;
}

/** Normalise an untrusted request body into a full `ScoutQuery`, coercing every field to its
 *  expected type and falling back to the default whenever the incoming value is the wrong shape. */
export function parseScoutQuery(body: unknown): ScoutQuery {
  const b = (body && typeof body === "object" ? body : {}) as Partial<ScoutQuery>;
  const defaults = createDefaultScoutFilters();
  const f = (b.filters && typeof b.filters === "object" ? b.filters : {}) as Partial<ScoutQuery["filters"]>;
  return {
    filters: {
      name: asString(f.name, defaults.name),
      position: asString(f.position, defaults.position),
      minAge: asFiniteNumber(f.minAge, defaults.minAge),
      maxAge: asFiniteNumber(f.maxAge, defaults.maxAge),
      minAvg: asFiniteNumber(f.minAvg, defaults.minAvg),
      maxAvg: asFiniteNumber(f.maxAvg, defaults.maxAvg),
      minPriceM: asFiniteNumber(f.minPriceM, defaults.minPriceM),
      maxPriceM: asFiniteNumber(f.maxPriceM, defaults.maxPriceM),
      league: asString(f.league, defaults.league),
      nationality: asString(f.nationality, defaults.nationality),
      attributeRanges: asAttributeRanges(f.attributeRanges, defaults.attributeRanges),
      onlyForSale: f.onlyForSale === true,
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
