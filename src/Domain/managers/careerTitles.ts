import type { ManagerTitle } from "@/types/managerTypes";

/** One competition won at a club: how many times and the points. */
export interface PassageTitleGroup {
  kind: ManagerTitle["kind"];
  competition: string;
  count: number;
  points: number;
  seasons: string[];
}

export interface PassageLike {
  squadId: string;
  from: string;
  to?: string;
}

/**
 * The titles of a manager grouped by the club passage they were won in (tester report, 8.8.5: the titles next to each
 * club instead of a list below). A title goes to the passage of its club whose dates hold the title's date; without a
 * date, to the latest passage of that club. Titles with no passage (national teams, missing passage) come back in
 * `rest`, in their order.
 */
export function titlesByPassage(passages: readonly PassageLike[], titles: readonly ManagerTitle[]): {
  byPassage: PassageTitleGroup[][];
  rest: ManagerTitle[];
} {
  const byPassage: PassageTitleGroup[][] = passages.map(() => []);
  const rest: ManagerTitle[] = [];
  for (const title of titles) {
    let idx = -1;
    for (let i = passages.length - 1; i >= 0; i--) {
      const p = passages[i]!;
      if (p.squadId !== title.squadId) continue;
      if (!title.on) { idx = i; break; }
      if (title.on >= p.from && (!p.to || title.on <= p.to)) { idx = i; break; }
    }
    if (idx < 0 && title.on) {
      // Credited a few days outside the passage (rollover after leaving): the latest passage of the club.
      for (let i = passages.length - 1; i >= 0; i--) if (passages[i]!.squadId === title.squadId) { idx = i; break; }
    }
    if (idx < 0) { rest.push(title); continue; }
    const groups = byPassage[idx]!;
    const g = groups.find((x) => x.kind === title.kind && x.competition === title.competition);
    if (g) {
      g.count++;
      g.points += title.points;
      g.seasons.push(title.season);
    } else {
      groups.push({ kind: title.kind, competition: title.competition, count: 1, points: title.points, seasons: [title.season] });
    }
  }
  for (const groups of byPassage) groups.sort((a, b) => b.points - a.points);
  return { byPassage, rest };
}
