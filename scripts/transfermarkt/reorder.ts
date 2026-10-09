import type { MainRole } from "@/Domain/roles";

/** A league is reordered only with at least this share of its players matched with a value... */
export const COVERAGE_MIN = 0.4;
/** ...and at least this many of them (a small league with a handful of valued players stays as it is). */
export const MIN_VALUED_PLAYERS = 100;
export const YOUTH_CAP_MAX_AGE = 21;

/**
 * `n` targets (descending) spread over the quantiles of `ref` (any order): `ref` itself when the sizes match, linear
 * interpolation between its sorted values otherwise; a single target is the median.
 */
export function quantileTargets(ref: number[], n: number): number[] {
  const s = [...ref].sort((a, b) => b - a), m = s.length;
  if (n === m) return s;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const q = n === 1 ? (m - 1) / 2 : (i * (m - 1)) / (n - 1);
    const lo = Math.floor(q), hi = Math.min(m - 1, lo + 1), f = q - lo;
    out.push(s[lo]! + (s[hi]! - s[lo]!) * f);
  }
  return out;
}

/**
 * Valued players of one league, reordered **by line**: the players whose final line (after the Transfermarkt position)
 * is L share the notes that the players whose old line was L had (`overall` = old note, at the old position), handed
 * out in level order. A line whose size changed takes the quantiles of its old multiset (`quantileTargets`); a line
 * with no old player takes the quantiles of the league's whole old multiset. Notes never move from one line to another.
 */
export function reorderLeague(
  players: { id: string; overall: number; fromLine: MainRole; line: MainRole; level: number }[],
): Map<string, number> {
  const out = new Map<string, number>();
  const lines = [...new Set(players.map((p) => p.line))].sort();
  for (const line of lines) {
    const inLine = players.filter((p) => p.line === line);
    const old = players.filter((p) => p.fromLine === line).map((p) => p.overall);
    const targets = quantileTargets(old.length ? old : players.map((p) => p.overall), inLine.length);
    const order = [...inLine].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
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
