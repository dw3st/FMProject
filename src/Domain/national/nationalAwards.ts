import { tournamentPlacement } from "@/Domain/national/competitions";
import type {
  NationalAwardedPlayer, NationalCompetition, NationalLeader, NationalTournament, NationalTournamentAwards,
} from "@/types/nationalTypes";

/** Tournament awards and the value boost of a good tournament (`national-teams.md` → "Prêmios"), pure. */

export const NATIONAL_AWARDS = {
  MIN_APPS: 3,
  TEAM_MIN_APPS: 2,
  TEAM_LINES: { GK: 1, DEF: 4, MID: 3, FWD: 3 } as const,
  SHORTLIST: 5,
  GOAL: 0.03,
  ASSIST: 0.02,
  CHAMPION: 0.3,
  WEIGHT: { wc: 1.2, euro: 0.8, copa: 0.7 } as Record<NationalTournament, number>,
  /** Market-value multipliers (the biggest applies, kept in `awardBoost`). */
  VALUE: { champion: 1.12, finalist: 1.08, semifinal: 1.05, bestPlayer: 1.15, topScorer: 1.12, bestGoalkeeper: 1.12, team: 1.1 },
  /** Manager-ranking points of a title. */
  MANAGER_POINTS: { wc: 200, euro: 120, copa: 100 } as Record<NationalTournament, number>,
} as const;

type Row = { id: string; l: NationalLeader };
const avg = (l: NationalLeader) => (l.apps > 0 ? l.ratingSum / l.apps : 0);
const r2 = (v: number) => Math.round(v * 100) / 100;
const idCmp = (a: Row, b: Row) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const byRating = (a: Row, b: Row) => avg(b.l) - avg(a.l) || (b.l.goals + b.l.assists) - (a.l.goals + a.l.assists) || idCmp(a, b);

function awarded(r: Row, value: number, slot?: string): NationalAwardedPlayer {
  return { playerId: r.id, name: r.l.name, nation: r.l.nation, squadId: r.l.squadId, value, ...(slot ? { slot } : {}) };
}

export function computeTournamentAwards(comp: NationalCompetition, nationOfTeam: (teamId: string) => string): NationalTournamentAwards {
  const rows: Row[] = Object.entries(comp.leaders).filter(([, l]) => !l.generated).map(([id, l]) => ({ id, l }));
  const eligible = rows.filter((r) => r.l.apps >= NATIONAL_AWARDS.MIN_APPS).sort(byRating);
  const best = eligible[0];
  const scorers = rows.filter((r) => r.l.goals > 0)
    .sort((a, b) => b.l.goals - a.l.goals || a.l.apps - b.l.apps || avg(b.l) - avg(a.l) || idCmp(a, b));
  const gk = eligible.find((r) => r.l.line === "GK");
  const team: NationalAwardedPlayer[] = [];
  for (const [line, n] of Object.entries(NATIONAL_AWARDS.TEAM_LINES)) {
    rows.filter((r) => r.l.line === line && r.l.apps >= NATIONAL_AWARDS.TEAM_MIN_APPS).sort(byRating).slice(0, n)
      .forEach((r) => team.push(awarded(r, r2(avg(r.l)), line)));
  }
  const champion = comp.championId ? nationOfTeam(comp.championId) : null;
  const score = (r: Row) =>
    avg(r.l) + NATIONAL_AWARDS.GOAL * r.l.goals + NATIONAL_AWARDS.ASSIST * r.l.assists + (champion && r.l.nation === champion ? NATIONAL_AWARDS.CHAMPION : 0);
  const shortlist = rows.filter((r) => r.l.apps >= NATIONAL_AWARDS.MIN_APPS)
    .sort((a, b) => score(b) - score(a) || idCmp(a, b))
    .slice(0, NATIONAL_AWARDS.SHORTLIST)
    .map((r) => ({ ...awarded(r, r2(avg(r.l))), score: r2(score(r)) }));
  return {
    competition: comp.slug, year: comp.year,
    ...(best ? { bestPlayer: awarded(best, r2(avg(best.l))) } : {}),
    ...(scorers[0] ? { topScorer: awarded(scorers[0], scorers[0].l.goals) } : {}),
    ...(gk ? { bestGoalkeeper: awarded(gk, r2(avg(gk.l))) } : {}),
    team, shortlist, weight: NATIONAL_AWARDS.WEIGHT[comp.tournament!],
  };
}

/**
 * Market-value multiplier of a real player after a finished tournament: placement of his team (champion,
 * finalist, semifinalist) and his awards — the biggest. 1 = none. Players with no game get nothing.
 */
export function tournamentValueMult(args: {
  comp: NationalCompetition;
  awards: NationalTournamentAwards;
  playerId: string;
  teamId: string;
  played: boolean;
}): number {
  if (!args.played) return 1;
  const v = NATIONAL_AWARDS.VALUE;
  const place = tournamentPlacement(args.comp, args.teamId);
  const out = [place === 1 ? v.champion : place === 2 ? v.finalist : place <= 4 ? v.semifinal : 1];
  const a = args.awards;
  if (a.bestPlayer?.playerId === args.playerId) out.push(v.bestPlayer);
  if (a.topScorer?.playerId === args.playerId) out.push(v.topScorer);
  if (a.bestGoalkeeper?.playerId === args.playerId) out.push(v.bestGoalkeeper);
  if (a.team.some((t) => t.playerId === args.playerId)) out.push(v.team);
  return Math.max(...out);
}

/** The award keys of a player (`best_player:<slug>`, …) for his national career. */
export function tournamentAwardKeys(a: NationalTournamentAwards, playerId: string): string[] {
  const out: string[] = [];
  if (a.bestPlayer?.playerId === playerId) out.push(`best_player:${a.competition}`);
  if (a.topScorer?.playerId === playerId) out.push(`top_scorer:${a.competition}`);
  if (a.bestGoalkeeper?.playerId === playerId) out.push(`best_goalkeeper:${a.competition}`);
  if (a.team.some((t) => t.playerId === playerId)) out.push(`team:${a.competition}`);
  return out;
}
