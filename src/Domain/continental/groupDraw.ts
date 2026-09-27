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

/**
 * 32 clubs -> 8 groups of 4. Pots by level (desc, then id). Each group takes one club per pot and no
 * two clubs of the same country. Pot by pot, clubs are shuffled and placed by backtracking so the
 * country rule never dead-ends when a valid assignment exists; if the whole pot truly can't be placed
 * without a country clash (pigeonholed by too many clubs from one country), the rule is dropped for
 * that pot only — every other pot keeps the strict rule, and "one club per pot per group" always holds.
 */
export function drawGroups(clubs: DrawClub[], rng: () => number): DrawnGroup[] {
  if (clubs.length !== 32) throw new Error(`drawGroups: need 32 clubs, got ${clubs.length}`);

  const sorted = [...clubs].sort(
    (a, b) => b.level - a.level || a.id.localeCompare(b.id, undefined, { numeric: true }),
  );
  const pots: DrawClub[][] = [0, 1, 2, 3].map((p) => sorted.slice(p * POT_SIZE, p * POT_SIZE + POT_SIZE));
  const groups: DrawClub[][] = GROUP_NAMES.map(() => []);

  const shuffle = <T>(xs: T[]): T[] => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };

  for (let potIndex = 0; potIndex < pots.length; potIndex++) {
    const order = shuffle(pots[potIndex]!);

    const place = (i: number, strict: boolean): boolean => {
      if (i === order.length) return true;
      const club = order[i]!;
      for (let g = 0; g < groups.length; g++) {
        const grp = groups[g]!;
        if (grp.length !== potIndex) continue; // one club per pot per group, in pot order
        if (strict && grp.some((c) => c.country === club.country)) continue;
        grp.push(club);
        if (place(i + 1, strict)) return true;
        grp.pop();
      }
      return false;
    };

    if (!place(0, true)) {
      // Country rule unsatisfiable for this pot alone (e.g. too many clubs of one country already
      // spread across earlier pots) — relax it, but "one club per pot" is still enforced by `place`.
      place(0, false);
    }
  }

  return groups.map((g, i) => ({ name: GROUP_NAMES[i]!, clubs: g.map((c) => c.id) }));
}
