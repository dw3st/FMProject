export interface LeagueRef { slug: string; country: string; tier: number; members: string[] }
export interface ClubMove { squadId: string; from: string; to: string }
export interface LineupResult { members: Map<string, string[]>; moves: ClubMove[]; removed: string[] }

const byId = (a: string, b: string) => a.localeCompare(b, "en", { numeric: true });

/**
 * New membership of every league. `applied` holds the ESPN member list (squadIds, new clubs included)
 * of each covered league. Covered leagues get exactly that list. A club that leaves a covered league
 * without appearing in another one drops to the highest non-covered level below it in its country
 * (the group with fewest clubs, then slug); with no such level it leaves the world. Non-covered leagues
 * lose the clubs claimed by covered leagues and receive the dropped ones. Lists come out sorted by id.
 */
export function planLineup(leagues: LeagueRef[], applied: Map<string, string[]>): LineupResult {
  const leagueOf = new Map<string, string>();
  for (const l of leagues) for (const s of l.members) leagueOf.set(s, l.slug);

  const assigned = new Map<string, string>();
  for (const [slug, ids] of applied) {
    for (const id of ids) {
      const prev = assigned.get(id);
      if (prev) throw new Error(`planLineup: ${id} listed in two leagues (${prev}, ${slug})`);
      assigned.set(id, slug);
    }
  }

  const members = new Map<string, string[]>();
  for (const l of leagues) members.set(l.slug, applied.get(l.slug) ?? l.members.filter((s) => !assigned.has(s)));

  const removed: string[] = [];
  for (const l of [...leagues].sort((a, b) => a.tier - b.tier || byId(a.slug, b.slug))) {
    if (!applied.has(l.slug)) continue;
    for (const s of [...l.members].sort(byId)) {
      if (assigned.has(s)) continue;
      const lower = leagues.filter((x) => x.country === l.country && x.tier > l.tier && !applied.has(x.slug));
      if (lower.length === 0) { removed.push(s); continue; }
      const tier = Math.min(...lower.map((x) => x.tier));
      const dest = lower.filter((x) => x.tier === tier)
        .sort((a, b) => members.get(a.slug)!.length - members.get(b.slug)!.length || byId(a.slug, b.slug))[0]!;
      members.get(dest.slug)!.push(s);
    }
  }

  const moves: ClubMove[] = [];
  for (const [slug, ids] of members) {
    ids.sort(byId);
    for (const s of ids) {
      const from = leagueOf.get(s);
      if (from && from !== slug) moves.push({ squadId: s, from, to: slug });
    }
  }
  moves.sort((a, b) => byId(a.squadId, b.squadId));
  return { members, moves, removed: removed.sort(byId) };
}
