/**
 * Map squad ids (e.g. "33") to URL club slugs (e.g. "manchester_united") using league standings
 * from leagueData.json, and back.
 */

export type StandingLike = { squadId: string; slug?: string };

/** Build squadId → club slug for one league (from leagueData standings). */
export function squadIdToClubSlugMap(standings: StandingLike[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const row of standings) {
    if (row.slug) m.set(row.squadId, row.slug);
  }
  return m;
}

/** Club slug of a squad id (the id itself when the standings carry no slug). */
export function clubSlugFromSquadId(squadId: string, idToClubSlug?: Map<string, string>): string {
  return idToClubSlug?.get(squadId) ?? squadId;
}

/**
 * Map a URL/API club segment (standings `slug` or numeric `squadId`) to the on-disk squad
 * filename stem (same as `squadId` in leagueData). Returns null if unknown.
 */
export function squadFileStemFromClubParam(
  standings: StandingLike[] | undefined,
  clubParam: string,
): string | null {
  if (!standings?.length) return null;
  if (standings.some((s) => s.squadId === clubParam)) return clubParam;
  const row = standings.find((s) => s.slug === clubParam);
  return row ? row.squadId : null;
}
