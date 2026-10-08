import { AWARDS } from "@/Domain/awards/awardsConfig";
import type { LeagueSeasonAwards, WorldAwardEntry, WorldAwards } from "@/types/awardTypes";
import type { ManagerRecord } from "@/types/managerTypes";

/**
 * World player and manager of the year (`.claude/rules/game/awards.md`), pure. Given in January on
 * the league seasons closed in `year`.
 */

const r2 = (v: number) => Math.round(v * 100) / 100;
const idAsc = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface Acc {
  entry: WorldAwardEntry;
  /** Largest single contribution (the entry shown comes from it). */
  bestPart: number;
  total: number;
  /** Player: best season score; manager: title points of the year. */
  tie: number;
}

export function computeWorldAwards(input: {
  year: number;
  on: string;
  leagues: LeagueSeasonAwards[];
  managers: ManagerRecord[];
}): WorldAwards {
  const players = new Map<string, Acc>();
  for (const l of input.leagues) {
    for (const p of l.shortlist.players) {
      const part = l.weight * (p.seasonScore - AWARDS.WORLD_BASE);
      const cur = players.get(p.playerId);
      const entry: WorldAwardEntry = { id: p.playerId, name: p.name, squadId: p.squadId, clubName: p.clubName, league: l.league, score: 0 };
      if (!cur) players.set(p.playerId, { entry, bestPart: part, total: part, tie: p.seasonScore });
      else {
        cur.total += part;
        cur.tie = Math.max(cur.tie, p.seasonScore);
        if (part > cur.bestPart) { cur.bestPart = part; cur.entry = entry; }
      }
    }
  }

  const managers = new Map<string, Acc>();
  for (const l of input.leagues) {
    for (const m of l.shortlist.managers) {
      const part = l.weight * m.score;
      const cur = managers.get(m.managerId);
      const entry: WorldAwardEntry = { id: m.managerId, name: m.name, squadId: m.squadId, clubName: m.clubName, league: l.league, score: 0 };
      if (!cur) managers.set(m.managerId, { entry, bestPart: part, total: part, tie: 0 });
      else {
        cur.total += part;
        if (part > cur.bestPart) { cur.bestPart = part; cur.entry = entry; }
      }
    }
  }
  const from = `${input.year}-01-01`;
  const to = `${input.year}-12-31`;
  for (const m of input.managers) {
    const titles = m.titles.filter((t) => t.on !== undefined && t.on >= from && t.on <= to);
    if (titles.length === 0) continue;
    const pts = titles.reduce((s, t) => s + t.points, 0);
    const cur = managers.get(m.id);
    if (cur) {
      cur.total += pts / AWARDS.WORLD_TITLE_DIVISOR;
      cur.tie = pts;
    } else {
      const top = [...titles].sort((a, b) => b.points - a.points)[0]!;
      managers.set(m.id, {
        entry: { id: m.id, name: m.name, squadId: top.squadId, clubName: "", league: top.competition, score: 0 },
        bestPart: 0, total: pts / AWARDS.WORLD_TITLE_DIVISOR, tie: pts,
      });
    }
  }

  const top = (acc: Map<string, Acc>): WorldAwardEntry[] =>
    [...acc.values()]
      .sort((a, b) => b.total - a.total || b.tie - a.tie || idAsc(a.entry.id, b.entry.id))
      .slice(0, AWARDS.TOP_TO_SHOW)
      .map((a) => ({ ...a.entry, score: r2(a.total) }));

  return { year: input.year, on: input.on, player: top(players), manager: top(managers) };
}
