/**
 * Map internal squad ids (e.g. squad__001) to filesystem / URL club slugs (e.g. atletico_mineiro)
 * using league standings from leagueData.json. Legacy ids stay leagueSlug_clubSlug.
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

export function clubSlugFromSquadId(
  squadId: string,
  leagueSlug: string,
  idToClubSlug?: Map<string, string>,
): string {
  const mapped = idToClubSlug?.get(squadId);
  if (mapped) return mapped;
  if (squadId.startsWith(`${leagueSlug}_`)) {
    return squadId.slice(leagueSlug.length + 1);
  }
  return squadId;
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
