import type { LeagueData, LeagueTeam } from "@/types/playerTypes";

/** When standings are missing, title-case the last `_` segment (legacy `leagueSlug_clubSlug` ids). */
export function fallbackTeamNameFromSquadId(squadId: string): string {
  const last = squadId.split("_").pop() ?? squadId;
  return last.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Single league — same logic as the league table fixtures view. */
export function teamDisplayNameFromStandings(
  squadId: string,
  standings: LeagueTeam[] | undefined | null,
): string {
  if (!standings?.length) return fallbackTeamNameFromSquadId(squadId);
  return standings.find((s) => s.squadId === squadId)?.name ?? fallbackTeamNameFromSquadId(squadId);
}

/**
 * Search all loaded leagues (cup opponents may sit outside the player’s division).
 * Uses canonical club names from `leagueData.json` standings.
 */
export function teamDisplayNameFromLeagues(squadId: string, leagues: LeagueData[]): string {
  if (!leagues.length) return fallbackTeamNameFromSquadId(squadId);
  for (const league of leagues) {
    const name = league.standings.find((s) => s.squadId === squadId)?.name;
    if (name) return name;
  }
  return fallbackTeamNameFromSquadId(squadId);
}
