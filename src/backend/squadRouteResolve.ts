import type { SquadIndex } from "@/backend/squadIndex";

export interface SquadLocation {
  leagueSlug: string;
  /** File stem the squad is stored under. */
  stem: string;
}

/**
 * Resolve a `/squad/:league/:club` route to the squad file it addresses.
 *
 * First the club param inside the given league (squadId, stem or slug). If the club
 * is not in that league, the param is tried as a squadId anywhere in the save — a
 * club that moved leagues keeps answering on its id. Null when neither matches.
 */
export function resolveSquadRoute(index: SquadIndex, league: string, club: string): SquadLocation | null {
  const stem = index.resolve(league, club);
  if (stem) return { leagueSlug: league, stem };
  const e = index.byId(club);
  return e ? { leagueSlug: e.leagueSlug, stem: e.stem } : null;
}

/**
 * True when a catalogue squad file (`Data/squads/{league}/{stem}.json`, id `squadId`)
 * is already represented in the save — by its id in ANY league, or by a file at the
 * same path. `/import-squads` skips these so a club that moved leagues is never
 * resurrected in its old folder.
 */
export function isSquadInSave(index: SquadIndex, league: string, stem: string, squadId: string): boolean {
  return index.byId(squadId) !== undefined || index.resolve(league, stem) !== null;
}
