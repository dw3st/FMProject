/**
 * Minimum-cost choice of `k` strictly increasing day indices out of `days` candidate days
 * (`0 .. days − 1`), by dynamic programming (`O(k · days²)`).
 *
 * - `dayCost(j, i)`: cost of putting pick `i` on day index `j`.
 * - `gapCost(g)`: cost of a `g`-day gap between two consecutive picks (`g ≥ minGap`).
 * - `firstCost(j)`: extra cost of the first pick on day `j` (e.g. its gap to an earlier, fixed pick).
 * - `minGap`: hard floor between consecutive picks (default 1 = just strictly increasing).
 *
 * Ties keep the earliest predecessor / last day found first (deterministic). Returns `null` when
 * the candidates have no room for `k` picks at `minGap`.
 *
 * Used by the degenerate-window fallbacks of the cup and continental calendars, so a pick lands on
 * a free day whenever one exists, ranked by how bad each kind of clash is (`dayCost`).
 */
export function pickDaysMinCost(args: {
  days: number;
  k: number;
  dayCost: (j: number, i: number) => number;
  gapCost: (gapDays: number) => number;
  firstCost?: (j: number) => number;
  minGap?: number;
}): number[] | null {
  const { days: D, k, dayCost, gapCost, firstCost = () => 0, minGap = 1 } = args;
  if (k <= 0) return [];
  if (D < 1 || (k - 1) * minGap > D - 1) return null;

  const dp: number[][] = Array.from({ length: k }, () => new Array<number>(D).fill(Infinity));
  const back: number[][] = Array.from({ length: k }, () => new Array<number>(D).fill(-1));
  for (let j = 0; j < D; j++) dp[0]![j] = firstCost(j) + dayCost(j, 0);

  for (let i = 1; i < k; i++) {
    for (let j = 0; j < D; j++) {
      let best = Infinity;
      let bestPrev = -1;
      for (let jp = 0; jp <= j - minGap; jp++) {
        const prevCost = dp[i - 1]![jp]!;
        if (prevCost === Infinity) continue;
        const total = prevCost + gapCost(j - jp);
        if (total < best) {
          best = total;
          bestPrev = jp;
        }
      }
      if (bestPrev === -1) continue;
      dp[i]![j] = best + dayCost(j, i);
      back[i]![j] = bestPrev;
    }
  }

  let bestLast = -1;
  let bestVal = Infinity;
  for (let j = 0; j < D; j++) {
    if (dp[k - 1]![j]! < bestVal) {
      bestVal = dp[k - 1]![j]!;
      bestLast = j;
    }
  }
  if (bestLast === -1) return null;

  const picks = new Array<number>(k);
  let cur = bestLast;
  for (let i = k - 1; i >= 0; i--) {
    picks[i] = cur;
    cur = back[i]![cur]!;
  }
  return picks;
}
