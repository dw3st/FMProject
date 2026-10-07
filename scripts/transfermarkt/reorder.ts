export const COVERAGE_MIN = 0.6;
export const YOUTH_CAP_MAX_AGE = 21;

/**
 * Matched players of one league, per main line: each line's multiset of current overalls is reassigned
 * in level order inside that line (a keeper never trades notes with a forward).
 */
export function reorderLeague(players: { id: string; overall: number; level: number; line: string }[]): Map<string, number> {
  const out = new Map<string, number>();
  const byLine = new Map<string, typeof players>();
  for (const p of players) byLine.set(p.line, [...(byLine.get(p.line) ?? []), p]);
  for (const list of byLine.values()) {
    const targets = list.map((p) => p.overall).sort((a, b) => b - a);
    const order = [...list].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
    order.forEach((p, i) => out.set(p.id, targets[i]!));
  }
  return out;
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
