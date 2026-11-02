import { normalizeForSearch } from "@/Domain/world/labels";

/** A club of the save, as `GET /api/saves/:saveId/clubs` lists it. */
export interface ClubEntry {
  id: string;
  name: string;
  league: string;
}

export interface ClubSearchGroup {
  /** Country as written in `leagueData`; "" when the league has none. */
  country: string;
  clubs: ClubEntry[];
}

export const CLUB_SEARCH_LIMIT = 30;

/** 0 = the name starts with the text, 1 = a word of it does, 2 = it contains the text, null = no match. */
function matchRank(name: string, query: string): number | null {
  const n = normalizeForSearch(name);
  if (n.startsWith(query)) return 0;
  const at = n.indexOf(query);
  if (at < 0) return null;
  return n.includes(` ${query}`) ? 1 : 2;
}

/**
 * The search field of the Leagues screen. An empty text lists the clubs of `homeCountry`; a text looks through the whole
 * world, best matches first, up to `CLUB_SEARCH_LIMIT`. Grouped by country, `homeCountry` first when it has a result, the
 * others in the order of their best match.
 */
export function searchClubs(
  clubs: readonly ClubEntry[],
  query: string,
  homeCountry: string,
  countryOfLeague: (league: string) => string,
): ClubSearchGroup[] {
  const q = normalizeForSearch(query.trim());
  const byName = (a: ClubEntry, b: ClubEntry) => a.name.localeCompare(b.name);
  const found = q === ""
    ? clubs.filter((c) => countryOfLeague(c.league) === homeCountry).sort(byName)
    : clubs
        .map((club) => ({ club, rank: matchRank(club.name, q) }))
        .filter((m): m is { club: ClubEntry; rank: number } => m.rank !== null)
        .sort((a, b) => a.rank - b.rank || byName(a.club, b.club))
        .slice(0, CLUB_SEARCH_LIMIT)
        .map((m) => m.club);

  const groups = new Map<string, ClubEntry[]>();
  if (found.some((c) => countryOfLeague(c.league) === homeCountry)) groups.set(homeCountry, []);
  for (const club of found) {
    const country = countryOfLeague(club.league);
    const list = groups.get(country);
    if (list) list.push(club);
    else groups.set(country, [club]);
  }
  return [...groups].map(([country, list]) => ({ country, clubs: list }));
}
