export const COVERAGE_MIN = 0.6;
export const YOUTH_CAP_MAX_AGE = 21;

/** Matched players of one league: the multiset of their current overalls, reassigned in level order. */
export function reorderLeague(players: { id: string; overall: number; level: number }[]): Map<string, number> {
  const targets = players.map((p) => p.overall).sort((a, b) => b - a);
  const order = [...players].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
  return new Map(order.map((p, i) => [p.id, targets[i]!]));
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/**
 * Unmatched players aged ≤ 21 rated above their club's matched median (after the reorder) come down to it.
 * `newOverall` holds the reordered targets of the matched players.
 */
export function youthCaps(
  players: { id: string; squadId: string; age: number; overall: number; matched: boolean }[],
  newOverall: Map<string, number>,
): Map<string, number> {
  const byClub = new Map<string, number[]>();
  for (const p of players) if (p.matched && newOverall.has(p.id)) byClub.set(p.squadId, [...(byClub.get(p.squadId) ?? []), newOverall.get(p.id)!]);
  const out = new Map<string, number>();
  for (const p of players) {
    if (p.matched || p.age > YOUTH_CAP_MAX_AGE) continue;
    const xs = byClub.get(p.squadId);
    if (!xs?.length) continue;
    const cap = median(xs);
    if (p.overall > cap) out.set(p.id, cap);
  }
  return out;
}
