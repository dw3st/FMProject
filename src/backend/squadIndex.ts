import type { SquadFile } from "@/backend/dal/ISaveDAL";
import type { LeagueTeam } from "@/types/playerTypes";

export interface SquadIndexEntry {
  squadId: string;
  leagueSlug: string;
  /** File stem the squad is stored under (what readSquad/writeSquad address). */
  stem: string;
  slug: string;
  name: string;
  colors: [string, string];
}

/**
 * Per-save membership index: which league folder each squad file lives in. The
 * save's `squads/{league}/` folders are the source of truth for league membership.
 */
export interface SquadIndex {
  byId(squadId: string): SquadIndexEntry | undefined;
  /** Teams currently stored in the league folder, sorted by squadId for determinism. */
  inLeague(leagueSlug: string): LeagueTeam[];
  /** Resolve a club param (squadId, stem or slug) inside a league to its file stem; null when not in that league. */
  resolve(leagueSlug: string, clubParam: string): string | null;
  leagues(): string[];
}

export function buildSquadIndex(files: SquadFile[]): SquadIndex {
  const byId = new Map<string, SquadIndexEntry>();
  const byLeague = new Map<string, SquadIndexEntry[]>();
  for (const f of files) {
    const s = f.squad;
    const e: SquadIndexEntry = {
      squadId: s.id,
      leagueSlug: f.leagueSlug,
      stem: f.clubSlug,
      slug: s.slug ?? s.id,
      name: s.name,
      colors: s.colors,
    };
    if (byId.has(e.squadId)) throw new Error(`squadIndex: duplicate squadId ${e.squadId}`);
    byId.set(e.squadId, e);
    let list = byLeague.get(e.leagueSlug);
    if (!list) byLeague.set(e.leagueSlug, (list = []));
    list.push(e);
  }
  for (const list of byLeague.values()) list.sort((a, b) => a.squadId.localeCompare(b.squadId));
  return {
    byId: (id) => byId.get(id),
    inLeague: (league) =>
      (byLeague.get(league) ?? []).map((e) => ({ squadId: e.squadId, name: e.name, colors: e.colors, slug: e.slug })),
    resolve: (league, param) => {
      const list = byLeague.get(league) ?? [];
      const hit = list.find((e) => e.squadId === param || e.stem === param) ?? list.find((e) => e.slug === param);
      return hit?.stem ?? null;
    },
    leagues: () => [...byLeague.keys()].sort(),
  };
}
