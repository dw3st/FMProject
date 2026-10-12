import type { LeagueData } from "@/types/playerTypes";

/** Names of teams outside the leagues (national teams of the player's calendar, Etapa 41b), by id. */
const extraNames = new Map<string, string>();

export function registerTeamNames(names: Record<string, string> | undefined): void {
  for (const [id, name] of Object.entries(names ?? {})) extraNames.set(id, name);
}

/** When standings are missing, title-case the last `_` segment (legacy `leagueSlug_clubSlug` ids). */
export function fallbackTeamNameFromSquadId(squadId: string): string {
  const extra = extraNames.get(squadId);
  if (extra) return extra;
  const last = squadId.split("_").pop() ?? squadId;
  return last.replace(/\b\w/g, (c) => c.toUpperCase());
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
