import { AWARDS } from "@/Domain/awards/awardsConfig";
import { aptitudeFor } from "@/Domain/positions/positionAptitude";
import { getMainRole, type MainRole } from "@/Domain/roles";
import type {
  AwardedManager, AwardedPlayer, GoalOfSeasonCandidate, LeagueSeasonAwards, ShortlistPlayer,
} from "@/types/awardTypes";
import type { ManagerRecord } from "@/types/managerTypes";
import type { PlayerHistoryRow, RosterPlayer, Squad, StandingRow } from "@/types/playerTypes";

/**
 * League season awards (`.claude/rules/game/awards.md`), pure: best player, young player, top
 * scorer, best goalkeeper, team of the season (4-3-3), best manager, plus the world shortlists.
 */

export interface AwardCandidate {
  player: RosterPlayer;
  squadId: string;
  clubName: string;
  line: MainRole;
  /** Age during the season (the squads aged at the transition). */
  age: number;
  leagueApps: number;
  leagueGoals: number;
  /** Average rating of the row (all competitions at the club: the season log does not split it). */
  rating: number;
  goals: number;
  assists: number;
  titles: string[];
}

function closingRow(p: RosterPlayer, league: string, season: string): PlayerHistoryRow | undefined {
  const rows = p.history ?? [];
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (r.season === season && r.league === league && !r.partial) return r;
  }
  return undefined;
}

/** The closing row (`season`/`league`, not partial) of every player of the league's squads. */
export function leagueCandidates(squads: Squad[], league: string, season: string): AwardCandidate[] {
  const out: AwardCandidate[] = [];
  for (const squad of squads) {
    for (const player of squad.players) {
      const row = closingRow(player, league, season);
      if (!row) continue;
      out.push({
        player, squadId: squad.id, clubName: squad.name,
        line: getMainRole(player.positions[0] ?? ""),
        age: player.age - 1,
        leagueApps: Math.max(0, row.apps - row.cupApps - row.contApps),
        leagueGoals: Math.max(0, row.goals - row.cupGoals - row.contGoals),
        rating: row.avgRating ?? 0,
        goals: row.goals, assists: row.assists, titles: row.titles,
      });
    }
  }
  return out;
}

/** rating + goals × G + assists × A + titles (league / cup / continental). */
export function seasonScore(row: { avgRating: number | null; goals: number; assists: number; titles: string[] }): number {
  const S = AWARDS.SEASON_SCORE;
  let titles = 0;
  for (const t of row.titles) {
    const kind = t.slice(0, t.indexOf(":")) as keyof typeof S.TITLE;
    titles += S.TITLE[kind] ?? 0;
  }
  return (row.avgRating ?? 0) + S.GOAL * row.goals + S.ASSIST * row.assists + titles;
}

const idCmp = (a: AwardCandidate, b: AwardCandidate) => (a.player.id < b.player.id ? -1 : a.player.id > b.player.id ? 1 : 0);
/** Rating desc, goals + assists desc, id asc. */
const byRating = (a: AwardCandidate, b: AwardCandidate) =>
  b.rating - a.rating || (b.goals + b.assists) - (a.goals + a.assists) || idCmp(a, b);

const r2 = (v: number) => Math.round(v * 100) / 100;

function awarded(c: AwardCandidate, value: number, slot?: string): AwardedPlayer {
  return {
    playerId: c.player.id, name: c.player.name, squadId: c.squadId, clubName: c.clubName,
    value, leagueApps: c.leagueApps, ...(slot ? { slot } : {}),
  };
}

const APT_RANK = { natural: 0, apt: 1, training: 2, unsuitable: 3 } as const;

/**
 * Team of the season in the 4-3-3 slots: per line the eligible players by rating (completed with
 * players of ≥ 1 league game when short); within the line, best rating first, each takes the free
 * slot of his best aptitude. A slot nobody can fill is left out (never happens in a real world).
 */
export function pickTeamOfSeason(cands: AwardCandidate[], minApps: number): AwardedPlayer[] {
  const slots = AWARDS.XI_SLOTS;
  const filled: (AwardedPlayer | undefined)[] = slots.map(() => undefined);
  for (const [line, count] of Object.entries(AWARDS.XI_LINES) as [MainRole, number][]) {
    const ofLine = cands.filter((c) => c.line === line);
    const eligible = ofLine.filter((c) => c.leagueApps >= minApps && c.rating > 0).sort(byRating);
    const picked = eligible.slice(0, count);
    if (picked.length < count) {
      const taken = new Set(picked.map((c) => c.player.id));
      const extra = ofLine.filter((c) => !taken.has(c.player.id) && c.leagueApps >= 1).sort(byRating);
      picked.push(...extra.slice(0, count - picked.length));
    }
    const lineSlots = slots.map((s, i) => ({ s, i })).filter(({ s }) => getMainRole(s) === line);
    for (const c of picked) {
      let best: { s: string; i: number } | undefined;
      let bestRank = Infinity;
      for (const slot of lineSlots) {
        if (filled[slot.i]) continue;
        const rank = APT_RANK[aptitudeFor(c.player, slot.s)];
        if (rank < bestRank) { bestRank = rank; best = slot; }
      }
      if (best) filled[best.i] = awarded(c, r2(c.rating), best.s);
    }
  }
  return filled.filter((p): p is AwardedPlayer => p !== undefined);
}

/** (target − position) / size + champion / promotion bonuses. */
export function managerAwardScore(a: { position: number; target: number; size: number; champion: boolean; promoted: boolean }): number {
  return (a.target - a.position) / Math.max(1, a.size)
    + (a.champion ? AWARDS.MANAGER_CHAMPION_BONUS : 0)
    + (a.promoted ? AWARDS.MANAGER_PROMOTED_BONUS : 0);
}

export interface LeagueAwardsInput {
  league: string;
  season: string;
  closedOn: string;
  country: string | null;
  tier: number;
  weight: number;
  totalRounds: number;
  /** The league's squads with the rows the rollover just wrote. */
  squads: Squad[];
  /** Final table, sorted. */
  table: StandingRow[];
  /** Managers in charge at the rollover (before the rollover sackings). */
  managers: ManagerRecord[];
  /** Board objective target per club (position). */
  targets: Map<string, number>;
  tierChanges: Record<string, { from: number; to: number }>;
  /** Middle of the league window: a manager hired after it is not eligible. */
  seasonMid: string;
  goalOfSeason?: GoalOfSeasonCandidate;
}

function rankManagers(input: LeagueAwardsInput): AwardedManager[] {
  const n = input.table.length;
  const scored: (AwardedManager & { pts: number })[] = [];
  input.table.forEach((row, i) => {
    if (row.mp <= 0) return;
    const m = input.managers.find((x) => x.squadId === row.squadId);
    if (!m || (m.hiredOn && m.hiredOn > input.seasonMid)) return;
    const position = i + 1;
    const target = input.targets.get(row.squadId) ?? Math.ceil(n / 2);
    const tc = input.tierChanges[row.squadId];
    const score = managerAwardScore({ position, target, size: n, champion: position === 1, promoted: !!tc && tc.to < tc.from });
    scored.push({ managerId: m.id, name: m.name, squadId: row.squadId, clubName: row.name, position, target, score: r2(score), pts: row.pts });
  });
  scored.sort((a, b) => b.score - a.score || b.pts - a.pts || (a.squadId < b.squadId ? -1 : a.squadId > b.squadId ? 1 : 0));
  return scored.map(({ pts: _pts, ...m }) => m);
}

export function computeLeagueAwards(input: LeagueAwardsInput): LeagueSeasonAwards {
  const cands = leagueCandidates(input.squads, input.league, input.season);
  const minApps = Math.ceil(input.totalRounds * AWARDS.MIN_ROUNDS_SHARE);
  const eligible = cands.filter((c) => c.leagueApps >= minApps && c.rating > 0).sort(byRating);

  const best = eligible[0];
  const young = eligible.find((c) => c.age <= AWARDS.YOUNG_MAX_AGE);
  const keeper = eligible.find((c) => c.line === "GK");
  const scorer = [...cands]
    .filter((c) => c.leagueGoals > 0)
    .sort((a, b) => b.leagueGoals - a.leagueGoals || a.leagueApps - b.leagueApps || b.rating - a.rating || idCmp(a, b))[0];

  const shortlistPlayers: ShortlistPlayer[] = eligible
    .map((c) => ({ c, s: seasonScore({ avgRating: c.rating, goals: c.goals, assists: c.assists, titles: c.titles }) }))
    .sort((a, b) => b.s - a.s || idCmp(a.c, b.c))
    .slice(0, AWARDS.SHORTLIST_PLAYERS)
    .map(({ c, s }) => ({ ...awarded(c, r2(c.rating)), seasonScore: r2(s) }));

  const managers = rankManagers(input);

  return {
    league: input.league, season: input.season, closedOn: input.closedOn, country: input.country,
    tier: input.tier, weight: input.weight,
    ...(best ? { bestPlayer: awarded(best, r2(best.rating)) } : {}),
    ...(young ? { youngPlayer: awarded(young, r2(young.rating)) } : {}),
    ...(scorer ? { topScorer: awarded(scorer, scorer.leagueGoals) } : {}),
    ...(keeper ? { bestGoalkeeper: awarded(keeper, r2(keeper.rating)) } : {}),
    teamOfSeason: pickTeamOfSeason(cands, minApps),
    ...(managers[0] ? { bestManager: managers[0] } : {}),
    ...(input.goalOfSeason ? { goalOfSeason: input.goalOfSeason } : {}),
    shortlist: { players: shortlistPlayers, managers: managers.slice(0, AWARDS.SHORTLIST_MANAGERS) },
  };
}
