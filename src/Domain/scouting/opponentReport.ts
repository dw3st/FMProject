import { preferredRole } from "@/Domain/positions/positionAptitude";
import type { Fixture } from "@/types/calendarTypes";
import type { Squad } from "@/types/playerTypes";

/**
 * Pre-match analyst (tester report 955c069c): the opponent's stand-out players, recent form, and results by the
 * formation it played and by the formation it faced. Pure; the backend reads the fixtures and the day logs.
 */
export const OPPONENT_REPORT = {
  KEY_PLAYERS: 3,
  /** Games a player needs this season to be ranked. */
  MIN_APPS: 3,
  FORM_GAMES: 5,
  /** Played games read for the tactic tables (newest first). */
  TACTIC_GAMES: 20,
};

export interface OpponentKeyPlayer {
  id: string;
  name: string;
  position: string;
  appearances: number;
  goals: number;
  assists: number;
  avgRating: number;
}

export type ResultLetter = "W" | "D" | "L";

export interface OpponentFormGame {
  date: string;
  competition: string;
  opponentId: string;
  /** Filled by the backend. */
  opponentName?: string;
  home: boolean;
  goalsFor: number;
  goalsAgainst: number;
  result: ResultLetter;
}

export interface TacticRecord { formation: string; played: number; won: number; drawn: number; lost: number }

export interface OpponentReport {
  keyPlayers: OpponentKeyPlayer[];
  form: OpponentFormGame[];
  /** Results with each formation the opponent played (most played first). */
  byOwnFormation: TacticRecord[];
  /** Results against each formation it faced. */
  byFacedFormation: TacticRecord[];
  /** Games of the tactic tables that carried formations (older day logs did not). */
  tacticGames: number;
}

/** Top players of a squad this season: goals, assists and the mean rating weighted together. */
export function keyPlayersOf(squad: Squad): OpponentKeyPlayer[] {
  const rows = squad.players
    .filter((p) => (p.seasonLog?.appearances ?? 0) >= OPPONENT_REPORT.MIN_APPS)
    .map((p) => {
      const l = p.seasonLog!;
      return {
        id: p.id, name: p.name, position: preferredRole(p),
        appearances: l.appearances, goals: l.goals, assists: l.assists, avgRating: l.avgRating,
        score: (l.goals + 0.6 * l.assists) / l.appearances * 3 + (l.avgRating - 6) * 2,
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return rows.slice(0, OPPONENT_REPORT.KEY_PLAYERS).map(({ score: _s, ...r }) => r);
}

/** Played fixtures of `clubId` with a result, newest first. */
export function playedGamesOf(clubId: string, fixtures: readonly Fixture[]): Fixture[] {
  return fixtures
    .filter((f) => f.played && f.result && (f.home === clubId || f.away === clubId))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

function letter(gf: number, ga: number, f: Fixture, home: boolean): ResultLetter {
  if (gf !== ga) return gf > ga ? "W" : "L";
  const p = f.decider?.penalties;
  if (!p || p.home === p.away) return "D";
  return (home ? p.home > p.away : p.away > p.home) ? "W" : "L";
}

/** Goals for and against (the stored result already holds extra time). */
function goalsOf(f: Fixture, home: boolean): [number, number] {
  const r = f.result!;
  return home ? [r.home, r.away] : [r.away, r.home];
}

export function buildOpponentReport(
  squad: Squad,
  games: readonly Fixture[],
  /** Formations of a game, keyed `competition:fixtureId`: [the opponent's, the other side's]. */
  formations: ReadonlyMap<string, [string, string]>,
): OpponentReport {
  const form: OpponentFormGame[] = games.slice(0, OPPONENT_REPORT.FORM_GAMES).map((f) => {
    const home = f.home === squad.id;
    const [gf, ga] = goalsOf(f, home);
    return { date: f.date, competition: f.competition, opponentId: home ? f.away : f.home, home, goalsFor: gf, goalsAgainst: ga, result: letter(gf, ga, f, home) };
  });
  const own = new Map<string, TacticRecord>();
  const faced = new Map<string, TacticRecord>();
  const add = (m: Map<string, TacticRecord>, formation: string, r: ResultLetter) => {
    const t = m.get(formation) ?? { formation, played: 0, won: 0, drawn: 0, lost: 0 };
    t.played++;
    if (r === "W") t.won++; else if (r === "D") t.drawn++; else t.lost++;
    m.set(formation, t);
  };
  let tacticGames = 0;
  for (const f of games.slice(0, OPPONENT_REPORT.TACTIC_GAMES)) {
    const fm = formations.get(`${f.competition}:${f.id}`);
    if (!fm) continue;
    tacticGames++;
    const home = f.home === squad.id;
    const [gf, ga] = goalsOf(f, home);
    const r = letter(gf, ga, f, home);
    add(own, fm[0], r);
    add(faced, fm[1], r);
  }
  const sorted = (m: Map<string, TacticRecord>) =>
    [...m.values()].sort((a, b) => b.played - a.played || a.formation.localeCompare(b.formation));
  return { keyPlayers: keyPlayersOf(squad), form, byOwnFormation: sorted(own), byFacedFormation: sorted(faced), tacticGames };
}
