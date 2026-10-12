import { fixtureWinner } from "@/Domain/cups/cupProgress";
import { groupTable, type GroupRow } from "@/Domain/continental/groupTable";
import { mulberry32, seedFrom, shuffle } from "@/Domain/rng";
import { roundRobinPairings } from "@/Domain/youthComps/youthSchedule";
import {
  TOURNAMENTS, qualifierSlug, tournamentDates, tournamentSlug,
} from "@/Domain/national/fifaCalendar";
import type { Fixture } from "@/types/calendarTypes";
import type {
  NationalCompetition, NationalGroup, NationalStage, NationalStageName, NationalTournament,
} from "@/types/nationalTypes";
import type { Confed } from "@/types/registrationTypes";

/** Qualifiers, tournaments and friendlies of the national teams (`.claude/rules/game/national-teams.md`), pure. */

export interface DrawTeam {
  id: string;
  confed: Confed;
  elo: number;
}

export const GROUP_NAMES = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

const byElo = (a: DrawTeam, b: DrawTeam) => b.elo - a.elo || (a.id < b.id ? -1 : 1);

/**
 * Pots by Elo (pot k = ranks kG..kG+G−1), one team of each pot per group (the last pot may be short); inside a
 * pot each team goes to the free group with the fewest teams of its confederation beyond `maxSame(confed)`, ties
 * by a seeded draw.
 */
export function drawPots(teams: DrawTeam[], groups: number, rng: () => number, maxSame: (c: Confed) => number = () => Infinity): NationalGroup[] {
  const sorted = [...teams].sort(byElo);
  const confedOf = new Map(teams.map((t) => [t.id, t.confed]));
  let best: NationalGroup[] = [];
  let bestCost = Infinity;
  // Greedy pot by pot can dead-end in a late pot: a few seeded attempts, the one with the fewest excess clashes.
  for (let attempt = 0; attempt < 200 && bestCost > 0; attempt++) {
    const out: NationalGroup[] = Array.from({ length: groups }, (_, i) => ({ name: GROUP_NAMES[i]!, teams: [] }));
    let total = 0;
    for (let p = 0; p * groups < sorted.length; p++) {
      const pot = shuffle(sorted.slice(p * groups, (p + 1) * groups), rng);
      const free = new Set(out.map((_, i) => i));
      for (const t of pot) {
        let cands: number[] = [];
        let cost = Infinity;
        for (const g of free) {
          const same = out[g]!.teams.filter((id) => confedOf.get(id) === t.confed).length;
          const c = Math.max(0, same + 1 - maxSame(t.confed));
          if (c < cost) { cost = c; cands = [g]; } else if (c === cost) cands.push(g);
        }
        const g = cands[Math.floor(rng() * cands.length)]!;
        out[g]!.teams.push(t.id);
        free.delete(g);
        total += cost;
      }
    }
    if (total < bestCost) { bestCost = total; best = out; }
  }
  return best.filter((g) => g.teams.length > 0);
}

/** Rounds of a double round robin of `n` teams (odd: one rests each round). */
export function roundsFor(n: number): number {
  return n < 2 ? 0 : 2 * (n % 2 === 0 ? n - 1 : n);
}

/** Groups of a qualifier: min(slots, ⌊N/4⌋) (≥ 1), more when the biggest group would not fit the dates. */
export function qualifierGroupCount(teams: number, slots: number, dates: number): number {
  let g = Math.max(1, Math.min(slots, Math.floor(teams / 4)));
  while (g < teams && roundsFor(Math.ceil(teams / g)) > dates) g++;
  return g;
}

export function buildQualifier(args: {
  tournament: NationalTournament;
  year: number;
  confed: Confed;
  teams: DrawTeam[];
  slots: number;
  dates: string[];
  seedKey: string;
}): NationalCompetition {
  const { tournament, year, confed, teams, slots, dates, seedKey } = args;
  const slug = qualifierSlug(tournament, year, confed);
  const base: NationalCompetition = {
    slug, kind: "qualifier", tournament, year, confed, teams: teams.map((t) => t.id), groups: [], stages: [],
    fixtures: [], slots, status: "scheduled", leaders: {},
  };
  if (teams.length <= slots) {
    return { ...base, qualified: [...teams].sort(byElo).map((t) => t.id), status: "finished" };
  }
  const g = qualifierGroupCount(teams.length, slots, dates.length);
  const groups = drawPots(teams, g, mulberry32(seedFrom(`${seedKey}:draw`)));
  const fixtures: Fixture[] = [];
  let maxRounds = 0;
  for (const grp of groups) {
    const rounds = roundRobinPairings(grp.teams, `${seedKey}:${grp.name}`);
    maxRounds = Math.max(maxRounds, rounds.length);
    rounds.forEach((pairs, r) => {
      pairs.forEach(([home, away], i) => {
        fixtures.push({
          id: `${slug}_${grp.name}_${r + 1}_${i}`, date: dates[r]!, competition: slug, round: r + 1,
          home, away, played: false, result: null,
        });
      });
    });
  }
  return { ...base, groups, stages: [{ name: "group", dates: dates.slice(0, maxRounds), drawn: true }], fixtures };
}

/** Group rows of a competition's group (`groupTable`: points, goal difference, goals, head-to-head). */
export function groupRows(comp: NationalCompetition, group: NationalGroup): GroupRow[] {
  const ids = new Set(group.teams);
  return groupTable(group.teams, comp.fixtures.filter((f) => f.round <= groupRoundCount(comp) && ids.has(f.home) && ids.has(f.away)));
}

/** Number of group matchdays (qualifier: double round robin; tournament: 3). */
export function groupRoundCount(comp: NationalCompetition): number {
  return comp.stages.find((s) => s.name === "group")?.dates.length ?? 0;
}

export function groupStageComplete(comp: NationalCompetition): boolean {
  const n = groupRoundCount(comp);
  const gs = comp.fixtures.filter((f) => f.round <= n);
  return gs.length > 0 && gs.every((f) => f.played);
}

interface Placed { id: string; pos: number; row: GroupRow; elo: number }

const ppg = (r: GroupRow) => (r.mp > 0 ? r.pts / r.mp : 0);
/** Position, then points per game, goal difference per game, goals per game, Elo, id. */
const placedOrder = (a: Placed, b: Placed) =>
  a.pos - b.pos || ppg(b.row) - ppg(a.row) ||
  (b.row.mp ? b.row.gd / b.row.mp : 0) - (a.row.mp ? a.row.gd / a.row.mp : 0) ||
  (b.row.mp ? b.row.gf / b.row.mp : 0) - (a.row.mp ? a.row.gf / a.row.mp : 0) ||
  b.elo - a.elo || (a.id < b.id ? -1 : 1);

function placedTeams(comp: NationalCompetition, elo: (id: string) => number): Placed[] {
  const out: Placed[] = [];
  for (const g of comp.groups) groupRows(comp, g).forEach((row, i) => out.push({ id: row.squadId, pos: i + 1, row, elo: elo(row.squadId) }));
  return out;
}

/** Who qualified from a finished qualifier: the group winners, then the best of the next places up to `slots`. */
export function qualifierQualified(comp: NationalCompetition, elo: (id: string) => number): string[] {
  if (comp.qualified) return comp.qualified;
  const placed = placedTeams(comp, elo).sort(placedOrder);
  return placed.slice(0, comp.slots ?? 0).map((p) => p.id);
}

// ── Tournaments ────────────────────────────────────────────────────────────────

/** Single round robin of a group of 4 (3 matchdays): 1-2 3-4, 1-3 4-2, 4-1 2-3. */
const GROUP4: [number, number][][] = [[[0, 1], [2, 3]], [[0, 2], [3, 1]], [[3, 0], [1, 2]]];

export function buildTournament(args: { tournament: NationalTournament; year: number; teams: DrawTeam[]; seedKey: string }): NationalCompetition {
  const { tournament, year, teams, seedKey } = args;
  const f = TOURNAMENTS[tournament];
  const slug = tournamentSlug(tournament, year);
  const dates = tournamentDates(tournament, year);
  const count = new Map<Confed, number>();
  for (const t of teams) count.set(t.confed, (count.get(t.confed) ?? 0) + 1);
  const groups = drawPots(teams, f.groups, mulberry32(seedFrom(`${seedKey}:draw`)), (c) => Math.ceil((count.get(c) ?? 0) / f.groups));
  const groupDates = dates.stageDates[0]!.dates;
  const fixtures: Fixture[] = [];
  for (const g of groups) {
    GROUP4.forEach((pairs, md) => {
      pairs.forEach(([a, b], i) => {
        const home = g.teams[a];
        const away = g.teams[b];
        if (!home || !away) return;
        fixtures.push({
          id: `${slug}_${g.name}_${md + 1}_${i}`, date: groupDates[md]!, competition: slug, round: md + 1,
          home, away, played: false, result: null, neutral: true,
        });
      });
    });
  }
  const stages: NationalStage[] = dates.stageDates.map((s) => ({ name: s.name, dates: s.dates, drawn: s.name === "group" }));
  return {
    slug, kind: "tournament", tournament, year, teams: teams.map((t) => t.id), groups, stages, fixtures,
    status: "scheduled", leaders: {},
  };
}

/** Round number of a knockout stage (after the 3 group matchdays). */
export function stageRound(comp: NationalCompetition, stage: NationalStageName): number {
  const i = comp.stages.findIndex((s) => s.name === stage);
  return groupRoundCount(comp) + i;
}

/**
 * Knockout seeds after the groups: winners, then runners-up, then the best thirds (each class ordered by points,
 * goal difference, goals, Elo); seed i meets seed K+1−i, swapping with the neighbour pairing to avoid two teams of
 * the same group in the first round.
 */
export function knockoutPairs(comp: NationalCompetition, elo: (id: string) => number): [string, string][] {
  const k = TOURNAMENTS[comp.tournament!].knockout;
  const placed = placedTeams(comp, elo);
  const groupOf = new Map<string, string>();
  for (const g of comp.groups) for (const id of g.teams) groupOf.set(id, g.name);
  const cls = (pos: number) => placed.filter((p) => p.pos === pos).sort(placedOrder);
  const seeds = [...cls(1), ...cls(2), ...cls(3), ...cls(4)].slice(0, k).map((p) => p.id);
  const pairs: [string, string][] = [];
  for (let i = 0; i < k / 2; i++) pairs.push([seeds[i]!, seeds[k - 1 - i]!]);
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i]!;
    if (groupOf.get(a) !== groupOf.get(b)) continue;
    for (let j = i + 1; j < pairs.length; j++) {
      const [c, d] = pairs[j]!;
      if (groupOf.get(a) !== groupOf.get(d) && groupOf.get(c) !== groupOf.get(b)) {
        pairs[i] = [a, d];
        pairs[j] = [c, b];
        break;
      }
    }
  }
  // Bracket order: 1st v Kth, then the pairing that meets it in the next round (seed order folding).
  return bracketOrder(pairs);
}

/** Classic bracket order (1, k/2, … folding) so the top seeds can only meet late. */
function bracketOrder<T>(pairs: T[]): T[] {
  let order = [0];
  while (order.length < pairs.length) {
    const n = order.length * 2;
    order = order.flatMap((i) => [i, n - 1 - i]);
  }
  return order.filter((i) => i < pairs.length).map((i) => pairs[i]!);
}

export interface TournamentChange {
  drawnStage?: NationalStageName;
  /** Teams knocked out by today's results (group stage end or a knockout loss). */
  eliminated: string[];
  championId?: string;
  finished?: boolean;
}

/** After a day's results: the knockout draw when the groups end, the next stage, the champion. */
export function advanceTournament(comp: NationalCompetition, elo: (id: string) => number): { comp: NationalCompetition; change: TournamentChange } {
  const change: TournamentChange = { eliminated: [] };
  if (comp.status === "finished") return { comp, change };
  let c = comp;
  const ko = c.stages.filter((s) => s.name !== "group");
  const firstKo = ko[0];
  if (firstKo && !firstKo.drawn && groupStageComplete(c)) {
    const pairs = knockoutPairs(c, elo);
    const advancing = new Set(pairs.flat());
    change.eliminated.push(...c.teams.filter((t) => !advancing.has(t)));
    c = withStageFixtures(c, firstKo.name, pairs);
    change.drawnStage = firstKo.name;
    return { comp: { ...c, status: "running" }, change };
  }
  for (let i = 0; i < ko.length; i++) {
    const st = ko[i]!;
    if (!st.drawn) break;
    const round = stageRound(c, st.name);
    const fx = c.fixtures.filter((f) => f.round === round);
    if (fx.length === 0 || !fx.every((f) => f.played)) continue;
    const next = ko[i + 1];
    const winners = fx.map((f) => fixtureWinner(f));
    if (winners.some((w) => !w)) continue;
    if (!next) {
      if (c.championId) continue;
      const champion = winners[0]!;
      const f = fx[0]!;
      change.eliminated.push(f.home === champion ? f.away : f.home, champion);
      change.championId = champion;
      change.finished = true;
      return { comp: { ...c, championId: champion, status: "finished" }, change };
    }
    if (next.drawn) continue;
    for (const f of fx) change.eliminated.push(fixtureWinner(f) === f.home ? f.away : f.home);
    const pairs: [string, string][] = [];
    for (let j = 0; j < winners.length; j += 2) pairs.push([winners[j]!, winners[j + 1]!]);
    c = withStageFixtures(c, next.name, pairs);
    change.drawnStage = next.name;
    return { comp: c, change };
  }
  return { comp: c, change };
}

function withStageFixtures(comp: NationalCompetition, stage: NationalStageName, pairs: [string, string][]): NationalCompetition {
  const st = comp.stages.find((s) => s.name === stage)!;
  const round = stageRound(comp, stage);
  const fixtures: Fixture[] = pairs.map(([home, away], i) => ({
    id: `${comp.slug}_${stage}_${i}`, date: st.dates[0]!, competition: comp.slug, round, home, away,
    played: false, result: null, neutral: true, knockout: true,
  }));
  return {
    ...comp,
    fixtures: [...comp.fixtures, ...fixtures],
    stages: comp.stages.map((s) => (s.name === stage ? { ...s, drawn: true } : s)),
  };
}

/** Final placement of a team (1 champion, 2 finalist, 3 semifinal, 5 quarter-final, …; group exit = K + 1). */
export function tournamentPlacement(comp: NationalCompetition, id: string): number {
  if (comp.championId === id) return 1;
  const ko = comp.stages.filter((s) => s.name !== "group");
  let reached = -1;
  for (let i = 0; i < ko.length; i++) {
    const round = stageRound(comp, ko[i]!.name);
    if (comp.fixtures.some((f) => f.round === round && (f.home === id || f.away === id))) reached = i;
  }
  if (reached < 0) return TOURNAMENTS[comp.tournament!].knockout + 1;
  // Losing in stage i of n: the stage holds 2^(n−i) teams; the losers place 2^(n−i−1) + 1.
  const teamsInStage = Math.pow(2, ko.length - reached);
  return teamsInStage / 2 + 1;
}

// ── Friendlies ────────────────────────────────────────────────────────────────

/**
 * Friendlies of one date for the teams without an official game: inside the confederation by Elo proximity (Elo
 * + seeded noise of ±NOISE, consecutive pairs), never the opponent in `avoid`; the leftovers cross confederations;
 * an odd one out rests. Home side drawn.
 */
export function pairFriendlies(
  teams: DrawTeam[],
  rng: () => number,
  avoid: ReadonlyMap<string, string> = new Map(),
): [string, string][] {
  const NOISE = 150;
  const noisy = new Map(teams.map((t) => [t.id, t.elo + (rng() * 2 - 1) * NOISE]));
  const pairs: [string, string][] = [];
  const leftovers: DrawTeam[] = [];
  const pairUp = (list: DrawTeam[]): DrawTeam[] => {
    const sorted = [...list].sort((a, b) => noisy.get(b.id)! - noisy.get(a.id)! || (a.id < b.id ? -1 : 1));
    const left: DrawTeam[] = [];
    while (sorted.length > 1) {
      const a = sorted.shift()!;
      const j = sorted.findIndex((b) => avoid.get(a.id) !== b.id);
      if (j < 0) { left.push(a); continue; }
      const b = sorted.splice(j, 1)[0]!;
      pairs.push(rng() < 0.5 ? [a.id, b.id] : [b.id, a.id]);
    }
    return [...left, ...sorted];
  };
  const byConfed = new Map<Confed, DrawTeam[]>();
  for (const t of teams) (byConfed.get(t.confed) ?? byConfed.set(t.confed, []).get(t.confed)!).push(t);
  for (const list of byConfed.values()) leftovers.push(...pairUp(list));
  pairUp(leftovers);
  return pairs;
}
