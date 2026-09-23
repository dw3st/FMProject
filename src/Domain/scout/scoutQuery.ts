import type { ScoutFilterState } from "@/GameInterface/Scout/scoutFilterState";
import type { DisplayPlayer } from "@/GameInterface/playerHelpers";
import { toDisplayPlayer, resolveSquadIdFromLeagues } from "@/GameInterface/playerHelpers";
import { getMainRole } from "@/GameInterface/positionHelpers";
import { ATTRIBUTE_LIST } from "@/GameInterface/AttributeLabels";
import type { Squad } from "@/types/playerTypes";
import type { MarketState } from "@/types/transferMarketTypes";

export type ScoutSortDir = "asc" | "desc";

export interface ScoutQuery {
  filters: ScoutFilterState;
  sortKey: string;
  sortDir: ScoutSortDir;
  /** 0-based page index. */
  page: number;
  pageSize: number;
}

export interface ScoutPage {
  rows: DisplayPlayer[];
  total: number;
  page: number;
  pageSize: number;
}

/** Response body of `POST /api/saves/:saveId/scout-search`. */
export interface ScoutSearchResponse extends ScoutPage {
  /** Nationalities of every player in the save (not just the filtered ones), sorted. */
  nationalities: string[];
  /** Ids of the returned rows that are on any sell list (AI or human). */
  sellListedIds: string[];
}

export const SCOUT_PAGE_SIZE_MIN = 10;
export const SCOUT_PAGE_SIZE_MAX = 200;

/** Flatten every squad into scout rows, resolving league/club slugs for profile links. */
export function mapSquadsToScoutPlayers(squads: Squad[], leagueSlugs: string[]): DisplayPlayer[] {
  const players: DisplayPlayer[] = [];
  for (const squad of squads) {
    const resolved = resolveSquadIdFromLeagues(squad.id, leagueSlugs);
    const leagueSlug = resolved?.leagueSlug ?? squad.leagueSlug;
    const clubSlug = resolved?.clubSlug ?? squad.slug;
    const squadCountry = squad.country ?? null;
    for (const p of squad.players) {
      const dp = toDisplayPlayer(p, squad.name, { squadCountry });
      players.push(
        leagueSlug && clubSlug
          ? { ...dp, leagueSlug, clubSlug }
          : dp,
      );
    }
  }
  return players;
}

/** Every player id on an AI club's sell list or on the human's sell list (same source as `/sell-listed-players`). */
export function collectSellListedIds(market: MarketState | null): string[] {
  const ids: string[] = [];
  if (!market) return ids;
  for (const profile of Object.values(market.profiles ?? {})) {
    for (const c of profile.sellList ?? []) ids.push(c.playerId);
  }
  for (const c of market.playerSellList ?? []) ids.push(c.playerId);
  return ids;
}

/** Distinct non-empty nationalities, sorted for the filter selector. */
export function collectNationalities(players: DisplayPlayer[]): string[] {
  const set = new Set<string>();
  for (const p of players) {
    if (p.nationality) set.add(p.nationality);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function filterScoutPlayers(
  players: DisplayPlayer[],
  filters: ScoutFilterState,
  sellListedIds: Set<string>,
): DisplayPlayer[] {
  const name = filters.name ? filters.name.toLowerCase() : "";
  return players.filter((player) => {
    if (filters.onlyForSale && !sellListedIds.has(player.id)) return false;
    if (name && !player.name.toLowerCase().includes(name)) return false;
    if (filters.position !== "all" && getMainRole(player.pos) !== filters.position) return false;
    if (player.age < filters.minAge || player.age > filters.maxAge) return false;
    if (player.avg < filters.minAvg || player.avg > filters.maxAvg) return false;
    if (player.valueMillions < filters.minPriceM || player.valueMillions > filters.maxPriceM) return false;
    if (filters.league !== "all" && player.leagueSlug !== filters.league) return false;
    if (filters.nationality !== "all" && player.nationality !== filters.nationality) return false;
    for (const attr of ATTRIBUTE_LIST) {
      const range = filters.attributeRanges?.[attr.id];
      if (!range) continue;
      if (range.min <= 0 && range.max >= 10) continue;
      const v = player.stats[attr.id];
      if (v < range.min || v > range.max) return false;
    }
    return true;
  });
}

export function sortScoutPlayers(players: DisplayPlayer[], sortKey: string, sortDir: ScoutSortDir): DisplayPlayer[] {
  return [...players].sort((a, b) => {
    const aVal = a[sortKey as keyof DisplayPlayer];
    const bVal = b[sortKey as keyof DisplayPlayer];
    if (typeof aVal === "string" && typeof bVal === "string") {
      return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    if (typeof aVal === "number" && typeof bVal === "number") {
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    }
    return 0;
  });
}

/**
 * Slice one page. `pageSize` is clamped to [10, 200]; a page past the end falls back to the last
 * valid page; an empty list always returns page 0 with no rows.
 */
export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { rows: T[]; total: number; page: number; pageSize: number } {
  const size = Math.min(
    SCOUT_PAGE_SIZE_MAX,
    Math.max(SCOUT_PAGE_SIZE_MIN, Number.isFinite(pageSize) ? Math.floor(pageSize) : SCOUT_PAGE_SIZE_MIN),
  );
  const total = rows.length;
  const lastPage = total === 0 ? 0 : Math.ceil(total / size) - 1;
  const requested = Number.isFinite(page) ? Math.floor(page) : 0;
  const p = Math.min(lastPage, Math.max(0, requested));
  return { rows: rows.slice(p * size, p * size + size), total, page: p, pageSize: size };
}

/** Filter → sort → paginate in one go. */
export function runScoutQuery(
  players: DisplayPlayer[],
  query: ScoutQuery,
  sellListedIds: Set<string>,
): ScoutPage {
  const filtered = filterScoutPlayers(players, query.filters, sellListedIds);
  const sorted = sortScoutPlayers(filtered, query.sortKey, query.sortDir);
  return paginate(sorted, query.page, query.pageSize);
}
