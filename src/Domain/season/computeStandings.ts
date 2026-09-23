import type { Fixture } from "@/types/calendarTypes";
import type { LeagueTeam, StandingRow } from "@/types/playerTypes";

/** Derive W/D/L/GF/GA/GD/PTS/form from played fixtures. Always starts from zeros. */
export function computeStandings(
  base: LeagueTeam[],
  fixtures: Fixture[],
  leagueSlug: string,
): StandingRow[] {
  const played = fixtures.filter((f) => f.competition === leagueSlug && f.played && f.result);

  type Acc = {
    mp: number;
    w: number;
    d: number;
    l: number;
    gf: number;
    ga: number;
    results: ("W" | "D" | "L")[];
  };
  const acc = new Map<string, Acc>();
  for (const row of base) acc.set(row.squadId, { mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, results: [] });

  for (const f of played.sort((a, b) => a.date.localeCompare(b.date))) {
    const h = acc.get(f.home);
    const a = acc.get(f.away);
    if (!h || !a || !f.result) continue;
    h.mp++;
    a.mp++;
    h.gf += f.result.home;
    h.ga += f.result.away;
    a.gf += f.result.away;
    a.ga += f.result.home;
    if (f.result.home > f.result.away) {
      h.w++;
      a.l++;
      h.results.push("W");
      a.results.push("L");
    } else if (f.result.home < f.result.away) {
      h.l++;
      a.w++;
      h.results.push("L");
      a.results.push("W");
    } else {
      h.d++;
      a.d++;
      h.results.push("D");
      a.results.push("D");
    }
  }

  return base
    .map((row) => {
      const s = acc.get(row.squadId)!;
      return {
        ...row,
        mp: s.mp,
        w: s.w,
        d: s.d,
        l: s.l,
        gf: s.gf,
        ga: s.ga,
        gd: s.gf - s.ga,
        pts: s.w * 3 + s.d,
        form: s.results.slice(-5) as ("W" | "D" | "L")[],
      };
    })
    .sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf);
}
