export interface DrawClub {
  id: string;
  country: string;
  level: number;
}

export interface DrawnGroup {
  name: string;
  clubs: string[];
}

const GROUP_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H"];
const POT_SIZE = 8;
const GROUP_COUNT = 8;

/**
 * Node budget for the strict (zero-clash) global search before giving up and going relaxed. Picked
 * empirically (see `groupDraw.test.ts`): with the most-constrained-variable ordering below, a
 * genuinely solvable pigeonhole-shaped input (e.g. two countries with exactly 8 clubs each, spread
 * 2-per-pot) needs well under 2,000 nodes, while a genuinely unsolvable one (a country with 9 clubs,
 * one clash unavoidable) burns the whole budget proving it and must still stay fast — 20,000 nodes
 * keeps that proof under ~20ms while leaving a wide margin over what real draws need.
 */
const STRICT_NODE_BUDGET = 20_000;

function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * One DFS over all 32 clubs (pots in order, one club per pot per group, no two clubs of the same
 * country in a group), budgeted so it can't explode on an input where a zero-clash draw is
 * impossible. Returns the 8 groups on success, `null` if the budget is exhausted or the search space
 * is fully explored without a solution (both cases mean "fall back to the relaxed path").
 *
 * A single DFS over the whole 32-club order (rather than one independent backtrack per pot) is what
 * gives this real lookahead: a bad choice for pot 0 that would strand pot 2 gets backtracked, instead
 * of pot 0 committing to the first arrangement that merely looks locally fine.
 *
 * Within each pot layer, the next club to place is chosen by most-remaining-constrained-first (fewest
 * still-valid groups), not simply the next one in shuffle order — a fixed shuffle order dead-ends far
 * too often on pigeonhole-shaped inputs (e.g. two countries each spread exactly 2-per-pot) well before
 * the node budget would otherwise prove a zero-clash draw exists. Ties among equally-constrained
 * clubs, and the target group among several equally valid ones, are broken by the shuffle order, so
 * the result is still a deterministic function of `rng`.
 */
function tryStrictDraw(pots: readonly DrawClub[][], rng: () => number): DrawClub[][] | null {
  const shuffledPots = pots.map((pot) => shuffle(pot, rng));
  const groups: DrawClub[][] = Array.from({ length: GROUP_COUNT }, () => []);
  let nodes = 0;

  const validGroupsFor = (club: DrawClub, potIndex: number): number[] => {
    const valid: number[] = [];
    for (let g = 0; g < GROUP_COUNT; g++) {
      const grp = groups[g]!;
      if (grp.length !== potIndex) continue; // one club per pot per group
      if (grp.some((c) => c.country === club.country)) continue;
      valid.push(g);
    }
    return valid;
  };

  const placePot = (potIndex: number, remaining: DrawClub[]): boolean => {
    if (remaining.length === 0) {
      return potIndex === shuffledPots.length - 1 || placePot(potIndex + 1, shuffledPots[potIndex + 1]!);
    }
    if (++nodes > STRICT_NODE_BUDGET) return false;

    // Most-constrained-variable: place the remaining club with the fewest legal groups next.
    let pickIndex = 0;
    let pickValid = validGroupsFor(remaining[0]!, potIndex);
    for (let i = 1; i < remaining.length; i++) {
      const valid = validGroupsFor(remaining[i]!, potIndex);
      if (valid.length < pickValid.length) {
        pickIndex = i;
        pickValid = valid;
        if (valid.length === 0) break; // can't get more constrained than a dead end
      }
    }
    if (pickValid.length === 0) return false;

    const club = remaining[pickIndex]!;
    const rest = [...remaining.slice(0, pickIndex), ...remaining.slice(pickIndex + 1)];
    for (const g of pickValid) {
      const grp = groups[g]!;
      grp.push(club);
      if (placePot(potIndex, rest)) return true;
      grp.pop();
    }
    return false;
  };

  return placePot(0, shuffledPots[0]!) ? groups : null;
}

/**
 * Assigns one pot's 8 clubs to the 8 groups (each group already holds one club per earlier pot),
 * minimising the number of same-country clashes this pot introduces — not just accepting the first
 * assignment found. Branch-and-bound over the 8x8 assignment: cost(club, group) is 1 if the group
 * already has a club of that country, 0 otherwise. Exploration order (both clubs and groups) is
 * shuffled from `rng` so ties among equal-cost assignments are broken deterministically per seed.
 * Mutates `groups` in place, appending exactly one club to each.
 */
function assignPotMinCost(pot: readonly DrawClub[], groups: DrawClub[][], rng: () => number): void {
  const clubOrder = shuffle(pot, rng);
  const groupOrder = shuffle(
    Array.from({ length: GROUP_COUNT }, (_, i) => i),
    rng,
  );
  const n = clubOrder.length;
  const usedGroup = new Array<boolean>(GROUP_COUNT).fill(false);
  const current = new Array<number>(n);
  let bestCost = Infinity;
  let bestAssign: number[] = [];

  const costOf = (club: DrawClub, groupIndex: number): number =>
    groups[groupIndex]!.some((c) => c.country === club.country) ? 1 : 0;

  const dfs = (i: number, running: number): void => {
    if (running >= bestCost) return;
    if (i === n) {
      bestCost = running;
      bestAssign = [...current];
      return;
    }
    const club = clubOrder[i]!;
    for (const g of groupOrder) {
      if (usedGroup[g]) continue;
      const extra = costOf(club, g);
      if (running + extra >= bestCost) continue;
      usedGroup[g] = true;
      current[i] = g;
      dfs(i + 1, running + extra);
      usedGroup[g] = false;
      if (bestCost === 0) return; // can't do better than zero clashes
    }
  };

  dfs(0, 0);

  for (let i = 0; i < n; i++) groups[bestAssign[i]!]!.push(clubOrder[i]!);
}

/** Relaxed path: pot by pot, minimise clashes instead of dropping the country rule outright. */
function relaxedDraw(pots: readonly DrawClub[][], rng: () => number): DrawClub[][] {
  const groups: DrawClub[][] = Array.from({ length: GROUP_COUNT }, () => []);
  for (const pot of pots) assignPotMinCost(pot, groups, rng);
  return groups;
}

/**
 * 32 clubs -> 8 groups of 4. Pots by level (desc, then id). Each group takes one club per pot and, in
 * the normal case, no two clubs of the same country. A single budgeted DFS over all 32 clubs looks
 * for a zero-clash draw first; only when that's infeasible (or too expensive to prove infeasible
 * within the budget) does the draw fall back to a relaxed path that still enforces one club per pot
 * per group, but minimises same-country clashes pot by pot instead of ignoring the rule.
 */
export function drawGroups(clubs: DrawClub[], rng: () => number): DrawnGroup[] {
  if (clubs.length !== 32) throw new Error(`drawGroups: need 32 clubs, got ${clubs.length}`);

  const sorted = [...clubs].sort(
    (a, b) => b.level - a.level || a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  const pots: DrawClub[][] = [0, 1, 2, 3].map((p) => sorted.slice(p * POT_SIZE, p * POT_SIZE + POT_SIZE));

  const groups = tryStrictDraw(pots, rng) ?? relaxedDraw(pots, rng);

  return groups.map((g, i) => ({ name: GROUP_NAMES[i]!, clubs: g.map((c) => c.id) }));
}
