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

/** A squadId found in more than one file: the entry the index kept and the ones it dropped. */
export interface SquadIndexDuplicate {
  squadId: string;
  kept: { leagueSlug: string; stem: string };
  dropped: { leagueSlug: string; stem: string }[];
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
  /** Like `resolve`, but returns the whole entry. */
  resolveEntry(leagueSlug: string, clubParam: string): SquadIndexEntry | null;
  leagues(): string[];
  /** squadIds stored in more than one file (lenient mode only; always empty in strict mode). */
  duplicates(): SquadIndexDuplicate[];
}

export interface BuildSquadIndexOptions {
  /** Throw on a duplicate squadId instead of keeping one copy and reporting it. */
  strict?: boolean;
}

const byNumericId = (a: string, b: string) => a.localeCompare(b);
const fileKey = (f: SquadFile) => `${f.leagueSlug}/${f.clubSlug}`;

/**
 * Rank of a copy when a squadId is in several files — higher wins:
 *  1. the highest `membershipRev` (bumped by every `moveSquad`, so a stale copy
 *     left behind by a move whose delete failed always loses);
 *  2. the copy whose folder matches its stored `squad.leagueSlug`;
 *  3. otherwise the first in sorted file-key order (files are pre-sorted).
 */
function beats(a: SquadFile, b: SquadFile): boolean {
  const ra = a.squad.membershipRev ?? 0;
  const rb = b.squad.membershipRev ?? 0;
  if (ra !== rb) return ra > rb;
  const ma = a.squad.leagueSlug === a.leagueSlug;
  const mb = b.squad.leagueSlug === b.leagueSlug;
  return ma && !mb;
}

/**
 * Build the index. Default is lenient: a squadId in several files keeps one copy
 * (see `beats`) and reports the rest via `duplicates()` — one stray file must not
 * make the whole save unreadable. `{ strict: true }` throws instead.
 */
export function buildSquadIndex(files: SquadFile[], opts: BuildSquadIndexOptions = {}): SquadIndex {
  const sorted = [...files].sort((a, b) => byNumericId(fileKey(a), fileKey(b)));
  const chosen = new Map<string, SquadFile>();
  const dropped = new Map<string, SquadFile[]>();
  for (const f of sorted) {
    const id = f.squad.id;
    const prev = chosen.get(id);
    if (!prev) {
      chosen.set(id, f);
      continue;
    }
    if (opts.strict) throw new Error(`squadIndex: duplicate squadId ${id}`);
    let list = dropped.get(id);
    if (!list) dropped.set(id, (list = []));
    if (beats(f, prev)) {
      list.push(prev);
      chosen.set(id, f);
    } else {
      list.push(f);
    }
  }

  const byId = new Map<string, SquadIndexEntry>();
  const byLeague = new Map<string, SquadIndexEntry[]>();
  for (const f of chosen.values()) {
    const s = f.squad;
    const e: SquadIndexEntry = {
      squadId: s.id,
      leagueSlug: f.leagueSlug,
      stem: f.clubSlug,
      slug: s.slug ?? s.id,
      name: s.name,
      colors: s.colors,
    };
    byId.set(e.squadId, e);
    let list = byLeague.get(e.leagueSlug);
    if (!list) byLeague.set(e.leagueSlug, (list = []));
    list.push(e);
  }
  for (const list of byLeague.values()) list.sort((a, b) => byNumericId(a.squadId, b.squadId));

  const duplicates: SquadIndexDuplicate[] = [...dropped.entries()]
    .sort(([a], [b]) => byNumericId(a, b))
    .map(([squadId, list]) => {
      const kept = chosen.get(squadId)!;
      return {
        squadId,
        kept: { leagueSlug: kept.leagueSlug, stem: kept.clubSlug },
        dropped: list.map((f) => ({ leagueSlug: f.leagueSlug, stem: f.clubSlug })),
      };
    });

  const resolveEntry = (league: string, param: string): SquadIndexEntry | null => {
    const list = byLeague.get(league) ?? [];
    return list.find((e) => e.squadId === param || e.stem === param) ?? list.find((e) => e.slug === param) ?? null;
  };

  return {
    byId: (id) => byId.get(id),
    inLeague: (league) =>
      (byLeague.get(league) ?? []).map((e) => ({ squadId: e.squadId, name: e.name, colors: e.colors, slug: e.slug })),
    resolve: (league, param) => resolveEntry(league, param)?.stem ?? null,
    resolveEntry,
    leagues: () => [...byLeague.keys()].sort(),
    duplicates: () => duplicates,
  };
}
