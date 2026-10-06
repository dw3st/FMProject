import { SCOUTING as S } from "@/Domain/scouting/scoutingConfig";
import { gainKnowledge, ratingGain, uncertaintyOf } from "@/Domain/scouting/knowledge";
import { obscurePlayer } from "@/Domain/staff/staff";
import { overallAvg } from "@/Domain/playerRating";
import { Player } from "@/Domain/Player";
import { generateIntake } from "@/Domain/youth/youth";
import { potentialBand } from "@/Domain/youth/potential";
import { weeklyWage } from "@/Domain/finance/wages";
import { getMainRole, type MainRole } from "@/Domain/roles";
import { addDays } from "@/Domain/dates";
import { clamp } from "@/Domain/math";
import { mulberry32, seedFrom } from "@/Domain/rng";
import type { FinancialTier, RosterPlayer, Squad } from "@/types/playerTypes";
import type {
  ScoutAssignment, ScoutFocus, ScoutGrade, ScoutProspect, ScoutReport, ScoutReportText, ScoutingState,
  ShortlistReason, ShortlistStatus, ScoutTargetKind,
} from "@/types/scoutingTypes";

/** Pure scouting missions, reports, gems, shortlist and prospects (`.claude/rules/game/scouting.md`). */

const MAIN_ROLES: MainRole[] = ["GK", "Defender", "Midfielder", "Forward"];
/** Starters per line of an XI ~4-3-3. */
const STARTERS: Record<MainRole, number> = { GK: 1, Defender: 4, Midfielder: 3, Forward: 3 };

const r1 = (v: number) => Math.round(v * 10) / 10;
const lineOf = (p: RosterPlayer): MainRole => getMainRole(p.positions[0] ?? "CM");

/** Mean overall of the starters (XI ~4-3-3) of each line of `squad`. */
export function starterLineAverages(squad: Squad): Record<MainRole, number> {
  const out = {} as Record<MainRole, number>;
  for (const role of MAIN_ROLES) {
    const line = squad.players.filter((p) => lineOf(p) === role).map(overallAvg).sort((a, b) => b - a).slice(0, STARTERS[role]);
    const pool = line.length > 0 ? line : squad.players.map(overallAvg);
    out[role] = pool.length > 0 ? pool.reduce((s, v) => s + v, 0) / pool.length : 5;
  }
  return out;
}

/** One candidate a mission can observe. */
export interface PoolEntry {
  player: RosterPlayer;
  squadId: string;
  club: string;
  league: string;
  /** Country of the club's league (a prospect: his country). */
  country: string;
  forSale?: boolean;
  prospectId?: string;
}

export interface ViewerContext {
  saveId: string;
  date: string;
  ownCountry: string;
  lineAverages: Record<MainRole, number>;
  ownWageFactor: number;
  /** Chief scout's multipliers (`scoutMultipliersOf`). */
  chief: { uncertainty: number; gain: number };
  /** Current effective knowledge of a player (implicit + stored, decayed). */
  knowledgeOf: (playerId: string) => number;
}

/** What the manager sees of `player` at knowledge `k`. */
export interface SeenProfile {
  noise: number;
  overall: [number, number];
  /** Centre of the overall range (the blurred overall). */
  seenOverall: number;
  potential: [number, number];
  value: [number, number];
  wageDemand: number;
}

export function seenProfile(player: RosterPlayer, k: number, ctx: Pick<ViewerContext, "saveId" | "chief" | "ownWageFactor">): SeenProfile {
  const noise = uncertaintyOf(k, ctx.chief.uncertainty);
  const seen = obscurePlayer(player, noise, ctx.saveId);
  const ov = overallAvg({ ...seen, overallAvg: undefined });
  const lo = clamp(ov - noise, 0, 10);
  const hi = clamp(ov + noise, 0, 10);
  const pot = player.age <= S.GROWTH_AGE ? potentialBand({ ...seen, overallAvg: undefined }) : [ov, ov] as [number, number];
  const value = (o: number) => r1(new Player(o, player.age).valueMillions);
  return {
    noise,
    seenOverall: r1(ov),
    overall: [r1(lo), r1(hi)],
    potential: [r1(clamp(pot[0] - noise, 0, 10)), r1(clamp(pot[1] + noise, 0, 10))],
    value: [value(lo), value(hi)],
    wageDemand: Math.round(weeklyWage(ov) * ctx.ownWageFactor),
  };
}

/** Relative note of a report: seen overall vs the own starters of the line, + half the seen growth (≤ 23). */
export function relativeNote(seenOverall: number, potentialHigh: number, age: number, lineAverage: number): number {
  const growth = age <= S.GROWTH_AGE ? Math.max(0, potentialHigh - seenOverall) : 0;
  return seenOverall - lineAverage + 0.5 * growth;
}

export function gradeOf(note: number): ScoutGrade {
  const t = S.GRADE_THRESHOLDS;
  return note >= t.A ? "A" : note >= t.B ? "B" : note >= t.C ? "C" : note >= t.D ? "D" : "E";
}

/** Gem: ≤ 20, from abroad (any country on a youth mission), seen potential ≥ own line starters + 0.3. */
export function isGem(args: { age: number; country: string; ownCountry: string; potentialHigh: number; lineAverage: number; youthMission?: boolean }): boolean {
  if (args.age > S.GEM_MAX_AGE) return false;
  if (!args.youthMission && args.country === args.ownCountry) return false;
  return args.potentialHigh >= args.lineAverage + S.GEM_MARGIN;
}

function reportText(seenOverall: number, lineAverage: number, grade: ScoutGrade, age: number): ScoutReportText {
  if (seenOverall >= lineAverage - S.IMPROVES_MARGIN) return "ready";
  if (age <= S.GROWTH_AGE && (grade === "A" || grade === "B")) return "future";
  if (grade === "C") return "squad";
  return "no_upgrade";
}

/** The report of one observed player at knowledge `k` (seen values, never the real ones). */
export function buildReport(entry: PoolEntry, k: number, ctx: ViewerContext, args: { missionId?: string; youthMission?: boolean }): ScoutReport {
  const p = entry.player;
  const line = lineOf(p);
  const seen = seenProfile(p, k, ctx);
  const lineAvg = ctx.lineAverages[line] ?? 5;
  const grade = gradeOf(relativeNote(seen.seenOverall, seen.potential[1], p.age, lineAvg));
  return {
    id: `rep_${seedFrom(`${ctx.saveId}:${args.missionId ?? "x"}:${p.id}:${ctx.date}`).toString(36)}`,
    date: ctx.date,
    ...(args.missionId ? { missionId: args.missionId } : {}),
    playerId: p.id,
    name: p.name,
    squadId: entry.squadId,
    club: entry.club,
    league: entry.league,
    country: entry.country,
    nationality: p.nationality ?? "",
    age: p.age,
    position: p.positions[0] ?? "—",
    k: Math.round(k),
    overall: seen.overall,
    potential: seen.potential,
    value: seen.value,
    wageDemand: seen.wageDemand,
    ...(p.contract ? { contractUntil: p.contract.until } : {}),
    forSale: !!entry.forSale,
    grade,
    gem: isGem({ age: p.age, country: entry.country, ownCountry: ctx.ownCountry, potentialHigh: seen.potential[1], lineAverage: lineAvg, youthMission: args.youthMission }),
    text: reportText(seen.seenOverall, lineAvg, grade, p.age),
    ...(entry.prospectId ? { prospectId: entry.prospectId } : {}),
  };
}

/** Pool a region mission observes, after the age limit of youth missions and the optional focus. */
export function missionPool(kind: ScoutTargetKind, focus: ScoutFocus | undefined, entries: PoolEntry[], ctx: ViewerContext): PoolEntry[] {
  return entries.filter(({ player: p }) => {
    if (kind === "youth" && p.age > S.YOUTH_MAX_AGE) return false;
    if (p.loan) return false;
    if (focus?.line && lineOf(p) !== focus.line) return false;
    if (focus?.maxAge !== undefined && p.age > focus.maxAge) return false;
    if (focus?.improves) {
      const seen = seenProfile(p, ctx.knowledgeOf(p.id), ctx);
      if (seen.seenOverall < (ctx.lineAverages[lineOf(p)] ?? 5) - S.IMPROVES_MARGIN) return false;
    }
    return true;
  });
}

/** Players observed per week by a scout of `rating`. */
export const observedPerWeek = (rating: number) => Math.min(S.OBSERVED_MAX, S.OBSERVED_BASE + Math.round(rating));

/** Weighted draw without replacement; players still little known weigh more. Deterministic by `seed`. */
export function pickObserved(pool: PoolEntry[], n: number, seed: string, knowledgeOf: (id: string) => number): PoolEntry[] {
  const rng = mulberry32(seedFrom(seed));
  const left = [...pool].sort((a, b) => (a.player.id < b.player.id ? -1 : 1));
  const out: PoolEntry[] = [];
  while (out.length < n && left.length > 0) {
    const w = left.map((e) => 1 + (100 - knowledgeOf(e.player.id)) / 25);
    let x = rng() * w.reduce((s, v) => s + v, 0);
    let i = 0;
    while (i < left.length - 1 && (x -= w[i]!) >= 0) i++;
    out.push(left.splice(i, 1)[0]!);
  }
  return out;
}

/** Inputs of one mission's week, prepared by the backend (pools read from disk). */
export interface MissionWeekInput {
  mission: ScoutAssignment;
  /** Rating of whoever leads it (vacant chief: 3). */
  leaderRating: number;
  /** Region missions: the candidates. Player missions: the target (empty when he vanished). */
  pool: PoolEntry[];
}

export type ScoutingNews =
  | { kind: "report"; missionId: string; target: ScoutAssignment["target"]; count: number; best: { name: string; grade: ScoutGrade }[] }
  | { kind: "mission_done"; missionId: string; target: ScoutAssignment["target"]; observed: number }
  | { kind: "gem"; report: ScoutReport }
  | { kind: "prospect"; report: ScoutReport; fee: number; expires: string };

export interface WeekResult {
  state: ScoutingState;
  news: ScoutingNews[];
  /** Reports written this week. */
  reports: ScoutReport[];
}

/**
 * One Monday of scouting: every active mission observes its pool (region: `observedPerWeek`
 * players; player: the target), knowledge grows by `REGION_GAIN`/`PLAYER_GAIN` × leader rating gain ×
 * chief gain, the best `REPORTS_PER_WEEK` of each mission become reports, gems are flagged (at most
 * `GEMS_PER_WEEK` messages) and finished missions leave.
 */
export function advanceScoutingWeek(state: ScoutingState, inputs: MissionWeekInput[], ctx: ViewerContext): WeekResult {
  const knowledge = { ...state.knowledge };
  const known = (id: string) => Math.max(ctx.knowledgeOf(id), knowledge[id]?.k ?? 0);
  const news: ScoutingNews[] = [];
  const reports: ScoutReport[] = [];
  const missions: ScoutAssignment[] = [];
  let gems = 0;
  const kctx: ViewerContext = { ...ctx, knowledgeOf: known };
  const byId = new Map(inputs.map((i) => [i.mission.id, i]));
  for (const mission of state.missions) {
    const input = byId.get(mission.id);
    if (!input) { missions.push(mission); continue; }
    const gain = ratingGain(input.leaderRating) * ctx.chief.gain;
    const youth = mission.target.kind === "youth";
    let observed: PoolEntry[];
    let done = false;
    if (mission.target.kind === "player") {
      observed = input.pool.slice(0, 1);
      for (const e of observed) knowledge[e.player.id] = gainKnowledge(known(e.player.id), S.PLAYER_GAIN * gain, ctx.date);
      const k = observed[0] ? known(observed[0].player.id) : 100;
      done = observed.length === 0 || k >= 100 || mission.weeksDone + 1 >= Math.min(mission.weeks, S.PLAYER_MAX_WEEKS);
    } else {
      observed = pickObserved(input.pool, observedPerWeek(input.leaderRating), `${ctx.saveId}:${mission.id}:${ctx.date}`, known);
      for (const e of observed) knowledge[e.player.id] = gainKnowledge(known(e.player.id), S.REGION_GAIN * gain, ctx.date);
      done = mission.weeksDone + 1 >= mission.weeks;
    }
    const written = observed
      .map((e) => buildReport(e, known(e.player.id), kctx, { missionId: mission.id, youthMission: youth }))
      .sort((a, b) => GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || b.overall[1] - a.overall[1] || (a.playerId < b.playerId ? -1 : 1))
      .slice(0, S.REPORTS_PER_WEEK);
    reports.push(...written);
    for (const rep of written) {
      if (rep.prospectId) continue;
      if (rep.gem && gems < S.GEMS_PER_WEEK) { news.push({ kind: "gem", report: rep }); gems++; }
    }
    if (written.length > 0) {
      news.push({ kind: "report", missionId: mission.id, target: mission.target, count: observed.length, best: written.slice(0, 3).map((r) => ({ name: r.name, grade: r.grade })) });
    }
    const next = { ...mission, weeksDone: mission.weeksDone + 1, observed: mission.observed + observed.length };
    if (done) news.push({ kind: "mission_done", missionId: mission.id, target: mission.target, observed: next.observed });
    else missions.push(next);
  }
  const reportIds = new Set(reports.map((r) => r.id));
  return {
    state: {
      ...state,
      missions,
      knowledge,
      reports: [...reports, ...state.reports.filter((r) => !reportIds.has(r.id))].slice(0, S.MAX_REPORTS),
    },
    news,
    reports,
  };
}

const GRADE_RANK: Record<ScoutGrade, number> = { A: 0, B: 1, C: 2, D: 3, E: 4 };

/** Region (or player) of a mission vs the human club: same country, same continent or elsewhere. */
export type TravelDistance = "country" | "continent" | "world";

/** Weekly travel cost of one active mission (€, positive). */
export function missionCost(kind: ScoutTargetKind, distance: TravelDistance, annualRevenue: number): number {
  const share = S.TRAVEL_SHARE[distance] * (kind === "player" ? S.PLAYER_TRAVEL_MULT : 1);
  return Math.round((share * Math.max(0, annualRevenue)) / 52);
}

/** Weeks a mission of `kind` may last (player: up to 3). */
export function allowedWeeks(kind: ScoutTargetKind): readonly number[] {
  if (kind === "continent") return S.CONTINENT_WEEKS;
  if (kind === "youth") return S.YOUTH_WEEKS;
  if (kind === "player") return [1, 2, 3];
  return S.REGION_WEEKS;
}

/** The chief's monthly picks: gems first, then grade A, at most 3, none of last month's. */
export function monthlyRecommendations(candidates: ScoutReport[], previous: string[] = [], n: number = S.RECOMMENDATIONS): ScoutReport[] {
  const seen = new Set(previous);
  const out: ScoutReport[] = [];
  const ordered = [...candidates]
    .filter((r) => !r.prospectId && r.k >= S.RECOMMEND_MIN_K)
    .sort((a, b) => Number(b.gem) - Number(a.gem) || GRADE_RANK[a.grade] - GRADE_RANK[b.grade] || (a.date === b.date ? (a.playerId < b.playerId ? -1 : 1) : a.date < b.date ? 1 : -1));
  for (const r of ordered) {
    if (out.length >= n) break;
    if (seen.has(r.playerId)) continue;
    if (!r.gem && r.grade !== "A") continue;
    seen.add(r.playerId);
    out.push(r);
  }
  return out;
}

export type { ShortlistReason };

/** What changed for a shortlisted player since last Monday (`null` now = retired). */
export function shortlistAlerts(prev: ShortlistStatus | undefined, now: ShortlistStatus | null): ShortlistReason[] {
  if (!now) return ["retired"];
  if (!prev) return [];
  const out: ShortlistReason[] = [];
  if (now.free && !prev.free) out.push("free");
  else if (!now.free && now.squadId !== prev.squadId) out.push("transferred");
  if (now.forSale && !prev.forSale) out.push("for_sale");
  if (now.loanListed && !prev.loanListed) out.push("loan_listed");
  if (now.contractEnding && !prev.contractEnding) out.push("contract_ending");
  return out;
}

/** Training compensation of a prospect from a country whose top league is of `tier`. */
export function prospectFee(tier: FinancialTier, ownWageFactor: number): number {
  return Math.round(S.PROSPECT_FEE[tier] * ownWageFactor / 1000) * 1000;
}

/**
 * 0–2 club-less 16–17-year-olds of `country` for one week of a youth mission: the academy intake
 * model (`generateIntake`) anchored on the country's top league (its clubs give the level and the
 * names), deterministic by save + country + week. Ids `prospect_<hash>_<i>`.
 */
export function generateProspects(args: {
  saveId: string;
  country: string;
  week: string;
  topLeagueSquads: Squad[];
  nextSeasonEnd: string;
  fee: number;
}): ScoutProspect[] {
  const players = args.topLeagueSquads.flatMap((s) => s.players);
  if (players.length === 0) return [];
  const key = `${args.saveId}:${args.country}:${args.week}`;
  const count = Math.floor(mulberry32(seedFrom(`${key}:count`))() * (S.PROSPECTS_MAX_PER_WEEK + 1));
  if (count === 0) return [];
  const tag = `prospect_${seedFrom(key).toString(36)}`;
  const anchor: Squad = {
    id: tag, name: args.country, colors: ["#555", "#888"], money: 0, country: args.country,
    players, financialTier: "MEDIUM",
  };
  const year = Number(args.week.slice(0, 4));
  const intake = generateIntake({ saveId: args.saveId, squad: anchor, year, nextSeasonEnd: args.nextSeasonEnd });
  return intake.slice(0, count).map((p, i) => {
    const id = `${tag}_${i}`;
    const player: RosterPlayer = { ...p, id, squadId: "", nationality: args.country, overallAvg: undefined };
    return { player, country: args.country, expires: addDays(args.week, S.PROSPECT_DAYS), reportId: "", fee: args.fee };
  });
}

/**
 * A youth mission's prospects join the state: each gets a report (knowledge of one week of
 * observation), is kept for `PROSPECT_DAYS` and announced (`prospect` news).
 */
export function addProspects(
  state: ScoutingState, prospects: ScoutProspect[], ctx: ViewerContext, args: { missionId: string; leaderRating: number },
): { state: ScoutingState; news: ScoutingNews[] } {
  if (prospects.length === 0) return { state, news: [] };
  const k = Math.min(100, S.REGION_GAIN * ratingGain(args.leaderRating) * ctx.chief.gain);
  const news: ScoutingNews[] = [];
  const added: ScoutProspect[] = [];
  const reports: ScoutReport[] = [];
  const existing = new Set(state.prospects.map((p) => p.player.id));
  for (const pr of prospects) {
    if (existing.has(pr.player.id)) continue;
    const report = buildReport(
      { player: pr.player, squadId: "", club: "", league: "", country: pr.country, prospectId: pr.player.id },
      k, ctx, { missionId: args.missionId, youthMission: true },
    );
    added.push({ ...pr, reportId: report.id });
    reports.push(report);
    news.push({ kind: "prospect", report, fee: pr.fee, expires: pr.expires });
  }
  const knowledge = { ...state.knowledge };
  for (const pr of added) knowledge[pr.player.id] = { k: Math.round(k), seen: ctx.date };
  return {
    state: {
      ...state,
      knowledge,
      prospects: [...state.prospects, ...added],
      reports: [...reports, ...state.reports].slice(0, S.MAX_REPORTS),
    },
    news,
  };
}

/** Prospects whose offer ran out leave (with their reports' prospect flag kept for history). */
export function pruneProspects(state: ScoutingState, date: string): ScoutingState {
  const kept = state.prospects.filter((p) => p.expires >= date);
  return kept.length === state.prospects.length ? state : { ...state, prospects: kept };
}
