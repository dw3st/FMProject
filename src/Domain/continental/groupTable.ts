import type { Fixture } from "@/types/calendarTypes";

export interface GroupRow {
  squadId: string;
  mp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

function tally(clubs: string[], fixtures: Fixture[]): Map<string, GroupRow> {
  const rows = new Map<string, GroupRow>(
    clubs.map((id) => [id, { squadId: id, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }]),
  );
  for (const fx of fixtures) {
    if (!fx.played || !fx.result) continue;
    const h = rows.get(fx.home);
    const a = rows.get(fx.away);
    if (!h || !a) continue;
    const { home: hg, away: ag } = fx.result;
    h.mp++;
    a.mp++;
    h.gf += hg;
    h.ga += ag;
    a.gf += ag;
    a.ga += hg;
    if (hg > ag) {
      h.w++;
      a.l++;
      h.pts += 3;
    } else if (hg < ag) {
      a.w++;
      h.l++;
      a.pts += 3;
    } else {
      h.d++;
      a.d++;
      h.pts++;
      a.pts++;
    }
  }
  for (const r of rows.values()) r.gd = r.gf - r.ga;
  return rows;
}

/**
 * Group standings: points, goal difference, goals for, then head-to-head (points, then goal
 * difference among the fixtures between the tied clubs only) among the still-tied clubs, then id.
 */
export function groupTable(clubs: string[], fixtures: Fixture[]): GroupRow[] {
  const rows = [...tally(clubs, fixtures).values()];
  const key = (r: GroupRow) => `${r.pts}|${r.gd}|${r.gf}`;
  rows.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);

  const out: GroupRow[] = [];
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j < rows.length && key(rows[j]!) === key(rows[i]!)) j++;
    const tied = rows.slice(i, j);
    if (tied.length > 1) {
      const ids = tied.map((r) => r.squadId);
      const h2h = tally(ids, fixtures.filter((fx) => ids.includes(fx.home) && ids.includes(fx.away)));
      tied.sort((a, b) => {
        const x = h2h.get(a.squadId)!;
        const y = h2h.get(b.squadId)!;
        return y.pts - x.pts || y.gd - x.gd || a.squadId.localeCompare(b.squadId, undefined, { numeric: true });
      });
    }
    out.push(...tied);
    i = j;
  }
  return out;
}
