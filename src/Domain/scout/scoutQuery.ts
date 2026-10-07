import type { ScoutFilterState } from "@/Domain/scout/scoutFilterState";
import type { DisplayPlayer } from "@/Domain/scout/displayPlayer";
import { toDisplayPlayer } from "@/Domain/scout/displayPlayer";
import { getMainRole } from "@/Domain/roles";
import { ATTRIBUTE_LIST, roundAttr } from "@/Domain/attributes";
import { wageFactorOf } from "@/Domain/finance/wages";
import { rangeMid, seenAttributeRange } from "@/Domain/scouting/seen";
import type { FreeAgent, Squad } from "@/types/playerTypes";
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
  /** Ids of the returned rows on the user's shortlist (`.claude/rules/game/scouting.md`). */
  shortlistIds?: string[];
}

const SCOUT_PAGE_SIZE_MIN = 10;
const SCOUT_PAGE_SIZE_MAX = 200;

/** Flatten every squad into scout rows, resolving league/club slugs for profile links. */
export function mapSquadsToScoutPlayers(squads: Squad[]): DisplayPlayer[] {
  const players: DisplayPlayer[] = [];
  for (const squad of squads) {
    const leagueSlug = squad.leagueSlug;
    const clubSlug = squad.slug;
    const squadCountry = squad.country ?? null;
    const wageFactor = wageFactorOf(squad);
    for (const p of squad.players) {
      const dp = toDisplayPlayer(p, squad.name, { squadCountry, wageFactor });
      players.push(
        leagueSlug && clubSlug
          ? { ...dp, leagueSlug, clubSlug }
          : dp,
      );
    }
  }
  return players;
}

/** Scout rows for the free-agent pool (`free: true`, no club). */
export function mapFreeAgentsToScoutPlayers(agents: FreeAgent[]): DisplayPlayer[] {
  return agents.map((f) => ({
    ...toDisplayPlayer(f.player, "", { squadCountry: null }),
    squadId: "",
    free: true,
  }));
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

/** An attribute as the screen shows it: the value, or the middle of its range (`seenAttributeRange`). */
function seenAttributeValue(value: number, noise: number | undefined): number {
  const range = seenAttributeRange(value, noise);
  return range ? rangeMid(range) : value;
}

/**
 * Filters and sorting read only what the user sees (`.claude/rules/game/scouting.md`): rows of
 * blurred players carry the middle of the shown overall/value/wage ranges in `avg`,
 * `valueMillions` and `wage` (`toDisplayPlayer`), never the real numbers.
 */
export function filterScoutPlayers(
  players: DisplayPlayer[],
  filters: ScoutFilterState,
  sellListedIds: Set<string>,
  shortlistIds: Set<string> = new Set(),
): DisplayPlayer[] {
  const name = filters.name ? filters.name.toLowerCase() : "";
  return players.filter((player) => {
    // Free agents only show in the "free agents" view; every other search is club players only.
    if (filters.onlyFree ? !player.free : player.free) return false;
    if (filters.onlyForSale && !sellListedIds.has(player.id)) return false;
    if (filters.onlyShortlist && !shortlistIds.has(player.id)) return false;
    // Rows without `knowledge` are exact (own squad).
    if ((filters.minKnowledge ?? 0) > 0 && (player.knowledge ?? 100) < filters.minKnowledge!) return false;
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
      // The screen sends 0..100 integers; converted once here and compared on 0..10.
      if (range.min <= 0 && range.max >= 100) continue;
      // What the screen shows (`scouting.md`): hidden attributes ("?") never pass an attribute
      // filter, and an attribute shown as a range filters by the middle of that range.
      if (player.hiddenAttrs) return false;
      const v = roundAttr(seenAttributeValue(player.stats[attr.id], player.statNoise));
      if (v < range.min / 10 || v > range.max / 10) return false;
    }
    return true;
  });
}

export function sortScoutPlayers(players: DisplayPlayer[], sortKey: string, sortDir: ScoutSortDir): DisplayPlayer[] {
  return [...players].sort((a, b) => {
    // The salary column is a text label ("61k"); it sorts by the wage behind it.
    const key = (sortKey === "salary" ? "wage" : sortKey) as keyof DisplayPlayer;
    // Knowledge: rows without it are the user's own players (exact = 100).
    const aVal = key === "knowledge" ? (a.knowledge ?? 100) : a[key];
    const bVal = key === "knowledge" ? (b.knowledge ?? 100) : b[key];
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
  shortlistIds: Set<string> = new Set(),
): ScoutPage {
  const filtered = filterScoutPlayers(players, query.filters, sellListedIds, shortlistIds);
  const sorted = sortScoutPlayers(filtered, query.sortKey, query.sortDir);
  return paginate(sorted, query.page, query.pageSize);
}
