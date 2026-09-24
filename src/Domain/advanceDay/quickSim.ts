/**
 * quickSim — statistical match resolution for leagues the player is not following.
 * Pure given its rng: the same inputs + the same rng produce the same output. Determinism
 * (e.g. for tests) requires passing a seeded rng — the default `Math.random` is intentionally
 * non-deterministic for production call sites. Produces a PlayedMatchRecording so the normal
 * post-match pipeline (seasonLog, energy, development) applies unchanged.
 */
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { MatchPlayerStats, MatchTeamStats } from "@/types/dayLogTypes";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import { ensureSeasonLog } from "@/Domain/advanceDay/seasonLog";
import {
  ATTACKING_MID_ROLES,
  DEFENSIVE_MID_ROLES,
  QUICK_SIM_CONFIG as C,
  ROLE_GROUP,
  type LineGroup,
} from "@/GameEngine/Configs/QuickSimConfig";
import { RATING_WEIGHTS } from "@/GameEngine/Configs/PlayerRatingConfig";

const ATTACKING_MID_SET = new Set<string>(ATTACKING_MID_ROLES);
const DEFENSIVE_MID_SET = new Set<string>(DEFENSIVE_MID_ROLES);

export type Rng = () => number;

export interface TeamStrength {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeper: number;
  /** Mean pace (`paceOf`) of the forward line (LW/ST/RW…). Not part of `teamLevel`. */
  forwardPace: number;
  /** Mean pace of the defensive line (CB/LB/RB/WB). Not part of `teamLevel`. */
  defensePace: number;
}

export interface QuickSimBreakdown {
  home: TeamStrength;
  away: TeamStrength;
  xgHome: number;
  xgAway: number;
}

export interface QuickSimInput {
  fixtureId: string;
  home: Squad;
  away: Squad;
  homeLineup: string[];
  awayLineup: string[];
  /**
   * Detailed slot role per lineup index (e.g. "LW", "CDM"), aligned with `homeLineup`.
   * Real squads store only main roles in `positions[0]`; the engine plays a player by his
   * slot role, so quickSim does too. Missing / unknown entries fall back to `positions[0]`.
   */
  homeRoles?: string[];
  awayRoles?: string[];
}

export interface QuickSimResult {
  recording: PlayedMatchRecording;
  breakdown: QuickSimBreakdown;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** An XI player with the role he plays this match (slot role, else roster `positions[0]`). */
interface XIPlayer {
  p: RosterPlayer;
  role: string;
}

/** Slot role if provided and known to ROLE_GROUP, else the roster's `positions[0]`. */
export function resolveRole(p: RosterPlayer, slotRole?: string): string {
  if (slotRole && ROLE_GROUP[slotRole]) return slotRole;
  return p.positions[0] ?? "CM";
}

export function lineGroupOfRole(role: string): LineGroup {
  return ROLE_GROUP[role] ?? "MID";
}

const groupOf = (x: XIPlayer) => lineGroupOfRole(x.role);

function stat(p: RosterPlayer, key: string): number {
  return (p.stats as unknown as Record<string, number | undefined>)[key] ?? 0;
}

function startFitness(p: RosterPlayer): number {
  return ensureSeasonLog(p).seasonLog!.fitness;
}

function fitnessFactor(p: RosterPlayer): number {
  return 1 - C.FATIGUE_PENALTY * (1 - startFitness(p) / 100);
}

/**
 * A player's pace on the engine's sprint-speed scale (0–10): the engine sprints at
 * ≈ 5 + 0.45·speed + 0.15·acceleration yds/s, so speed weighs 3× acceleration. Raw attributes,
 * no fitness factor (that is how PACE_EDGE_WEIGHT was fitted).
 */
function paceOf(p: RosterPlayer): number {
  return (3 * stat(p, "speed") + stat(p, "acceleration")) / 4;
}

function linePace(players: XIPlayer[], fallback: XIPlayer[]): number {
  const pool = players.length ? players : fallback;
  return avg(pool.map(({ p }) => paceOf(p)));
}

function lineValue(players: XIPlayer[], keys: readonly string[], fallback: XIPlayer[]): number {
  const pool = players.length ? players : fallback;
  return avg(pool.map(({ p }) => avg(keys.map((k) => stat(p, k))) * fitnessFactor(p))) + C.STRENGTH_FLOOR;
}

/** `roles`, when given, is aligned with `players` (the slot role each one plays). */
export function teamStrength(players: RosterPlayer[], roles?: string[]): TeamStrength {
  return strengthOf(players.map((p, i) => ({ p, role: resolveRole(p, roles?.[i]) })));
}

function strengthOf(xi: XIPlayer[]): TeamStrength {
  const outfield = xi.filter((x) => groupOf(x) !== "GK");
  const attackers = xi.filter((x) => groupOf(x) === "FWD" || ATTACKING_MID_SET.has(x.role));
  const mids = xi.filter((x) => groupOf(x) === "MID");
  const defenders = xi.filter((x) => groupOf(x) === "DEF" || DEFENSIVE_MID_SET.has(x.role));
  const keepers = xi.filter((x) => groupOf(x) === "GK");
  return {
    attack: lineValue(attackers, C.ATTACK_KEYS, outfield),
    midfield: lineValue(mids, C.MIDFIELD_KEYS, outfield),
    defense: lineValue(defenders, C.DEFENSE_KEYS, outfield),
    goalkeeper: keepers.length ? lineValue(keepers, C.GOALKEEPER_KEYS, keepers) : C.STRENGTH_FLOOR,
    forwardPace: linePace(xi.filter((x) => groupOf(x) === "FWD"), attackers.length ? attackers : outfield),
    defensePace: linePace(xi.filter((x) => groupOf(x) === "DEF"), defenders.length ? defenders : outfield),
  };
}

/** A team's overall level: the mean of its 4 line strengths. */
export function teamLevel(s: TeamStrength): number {
  return (s.attack + s.midfield + s.defense + s.goalkeeper) / 4;
}

/**
 * xG for `attacker` vs `defender`. The strength ratio decides who is favoured; the match
 * level (mean of both teams' `teamLevel`) scales the goal rate, since in the full engine
 * strong-vs-strong matches produce more goals than weak-vs-weak ones at the same ratio.
 * The pace edge (attacker's forward line vs defender's back line) scales the chance volume:
 * the engine's through-ball races are decided by sprint speed.
 */
export function expectedGoals(attacker: TeamStrength, defender: TeamStrength, isHome: boolean): number {
  const ratio = (attacker.attack * attacker.midfield) / (defender.defense * defender.goalkeeper);
  const matchLevel = (teamLevel(attacker) + teamLevel(defender)) / 2;
  const paceEdge = attacker.forwardPace - defender.defensePace;
  return (
    C.BASE_GOALS *
    Math.pow(ratio, C.STRENGTH_EXPONENT) *
    Math.pow(matchLevel / C.LEVEL_REF, C.LEVEL_EXPONENT) *
    Math.exp(C.PACE_EDGE_WEIGHT * paceEdge) *
    (isHome ? C.HOME_ADVANTAGE : 1)
  );
}

/**
 * Knuth's algorithm — O(lambda) draws per sample. Accurate and fast enough for the
 * small, per-player, per-match rates used here (< ~50); not suitable for large lambda.
 */
export function samplePoisson(lambda: number, rng: Rng): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}

/** Standard normal sample (Box–Muller). */
function gaussian(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/**
 * Goals as Binomial(GOAL_CHANCES, xg / GOAL_CHANCES): same mean as Poisson(xg) but
 * under-dispersed (fewer 0-0s), closer to the full engine's scoreline distribution.
 */
function sampleGoals(xg: number, rng: Rng): number {
  const n = C.GOAL_CHANCES;
  const p = clamp(xg / n, 0, 1);
  let goals = 0;
  for (let i = 0; i < n; i++) if (rng() < p) goals++;
  return goals;
}

function weightedPick<T>(items: T[], weight: (t: T) => number, rng: Rng): T | null {
  const weights = items.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function uniformPick<T>(items: T[], rng: Rng): T | null {
  if (items.length === 0) return null;
  const idx = Math.min(items.length - 1, Math.floor(rng() * items.length));
  return items[idx]!;
}

function emptyStats(): MatchPlayerStats {
  return {
    passesAttempted: 0, passesCompleted: 0, passesFailed: 0,
    shots: 0, goals: 0, assists: 0, interceptions: 0, tackles: 0,
  };
}

/**
 * `tacklesFailed` is not part of `MatchPlayerStats` (shared with the live engine's
 * recording shape) — quickSim tracks it separately and passes it in explicitly.
 * Defaults to 0 so existing single-arg call sites remain valid.
 */
export function ratingFromStats(s: MatchPlayerStats, tacklesFailed = 0): number {
  const W = RATING_WEIGHTS;
  const raw =
    W.BASELINE +
    s.goals * W.GOAL +
    s.assists * W.ASSIST +
    s.shots * W.SHOT +
    s.passesCompleted * W.PASS_COMPLETED +
    s.passesFailed * W.PASS_FAILED +
    s.tackles * W.TACKLE_WON +
    tacklesFailed * W.TACKLE_FAILED +
    s.interceptions * W.INTERCEPTION;
  return Math.round(clamp(raw, 0, 10) * 10) / 10;
}

/** Skips empty / unknown / duplicate ids; each kept player takes the role of his own slot index. */
function resolveXI(squad: Squad, lineup: string[], roles?: string[]): XIPlayer[] {
  const byId = new Map(squad.players.map((p) => [p.id, p]));
  const xi: XIPlayer[] = [];
  lineup.forEach((id, i) => {
    const p = id ? byId.get(id) : undefined;
    if (p && !xi.some((x) => x.p === p)) xi.push({ p, role: resolveRole(p, roles?.[i]) });
  });
  return xi;
}

function fillSide(
  xi: XIPlayer[],
  goals: number,
  xg: number,
  stats: Record<string, MatchPlayerStats>,
  tacklesFailed: Record<string, number>,
  level: number,
  matchLevel: number,
  rng: Rng,
): void {
  const scorerWeight = (x: XIPlayer) => C.ROLE_GOAL_WEIGHT[groupOf(x)] * (0.5 + stat(x.p, "finishing") / 10);
  const assistWeight = (x: XIPlayer) => C.ROLE_ASSIST_WEIGHT[groupOf(x)] * (0.5 + stat(x.p, "passing") / 10);

  for (let g = 0; g < goals; g++) {
    const scorer = weightedPick(xi, scorerWeight, rng) ?? uniformPick(xi, rng);
    if (!scorer) break;
    stats[scorer.p.id]!.goals++;
    stats[scorer.p.id]!.shots++;
    if (rng() >= C.NO_ASSIST_RATE) {
      const assister = weightedPick(xi.filter((x) => x.p.id !== scorer.p.id), assistWeight, rng);
      if (assister) stats[assister.p.id]!.assists++;
    }
  }

  const shotsPerXg = C.SHOTS_PER_XG * Math.pow(matchLevel / C.LEVEL_REF, C.SHOTS_LEVEL_EXPONENT);
  const extraShots = samplePoisson(xg * shotsPerXg, rng);
  for (let i = 0; i < extraShots; i++) {
    const shooter = weightedPick(xi, scorerWeight, rng) ?? uniformPick(xi, rng);
    if (shooter) stats[shooter.p.id]!.shots++;
  }

  for (const x of xi) {
    const p = x.p;
    const group = groupOf(x);
    const s = stats[p.id]!;
    const lv = (exp: Record<LineGroup, number>) => Math.pow(level / C.LEVEL_REF, exp[group]);
    const passRate = C.PASSES_PER_MATCH[group] * lv(C.PASS_LEVEL_EXPONENT);
    const attempts = samplePoisson(passRate, rng);
    const rate = C.PASS_COMPLETION_BASE + C.PASS_COMPLETION_SKILL * (stat(p, "passing") / 10);
    let completed = 0;
    for (let i = 0; i < attempts; i++) if (rng() < rate) completed++;
    s.passesAttempted = attempts;
    s.passesCompleted = completed;
    s.passesFailed = attempts - completed;
    s.tackles = samplePoisson(C.TACKLES_PER_MATCH[group] * lv(C.TACKLE_LEVEL_EXPONENT) * (0.5 + stat(p, "tackling") / 10), rng);
    tacklesFailed[p.id] = samplePoisson(C.TACKLES_FAILED_PER_MATCH[group] * lv(C.TACKLE_FAIL_LEVEL_EXPONENT), rng);
    s.interceptions = samplePoisson(
      C.INTERCEPTIONS_PER_MATCH[group] * lv(C.INTERCEPTION_LEVEL_EXPONENT) * (0.5 + stat(p, "pressing") / 10), rng);
  }
}

function sumTeamStats(xi: XIPlayer[], stats: Record<string, MatchPlayerStats>): MatchTeamStats {
  const t: MatchTeamStats = { shots: 0, passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0 };
  for (const { p } of xi) {
    const s = stats[p.id]!;
    t.shots += s.shots;
    t.passesCompleted += s.passesCompleted;
    t.passesAttempted += s.passesAttempted;
    t.tackles += s.tackles;
    t.interceptions += s.interceptions;
  }
  return t;
}

export function quickSimMatch(input: QuickSimInput, rng: Rng = Math.random): QuickSimResult {
  const start = performance.now();
  const homeXI = resolveXI(input.home, input.homeLineup, input.homeRoles);
  const awayXI = resolveXI(input.away, input.awayLineup, input.awayRoles);

  const home = strengthOf(homeXI);
  const away = strengthOf(awayXI);
  const xgHome = expectedGoals(home, away, true);
  const xgAway = expectedGoals(away, home, false);
  // Match-day dominance: one side's chances rise as the other's fall (anti-correlated,
  // mean-1 lognormal factors). The full engine's results are more lopsided than two
  // independent Poisson draws around xG. `breakdown` keeps the pre-dominance xG.
  const d = C.DOMINANCE_SIGMA * gaussian(rng);
  const shrink = (C.DOMINANCE_SIGMA * C.DOMINANCE_SIGMA) / 2;
  const xgHomeDay = xgHome * Math.exp(d - shrink);
  const xgAwayDay = xgAway * Math.exp(-d - shrink);
  // An empty XI can't score — force 0 so recording.score always agrees with the sum of
  // per-player goals (an XI can be empty if a lineup is entirely blank/unknown ids).
  const goalsHome = homeXI.length > 0 ? sampleGoals(xgHomeDay, rng) : 0;
  const goalsAway = awayXI.length > 0 ? sampleGoals(xgAwayDay, rng) : 0;

  const playerStats: Record<string, MatchPlayerStats> = {};
  const tacklesFailed: Record<string, number> = {};
  for (const { p } of [...homeXI, ...awayXI]) playerStats[p.id] = emptyStats();
  const matchLevel = (teamLevel(home) + teamLevel(away)) / 2;
  fillSide(homeXI, goalsHome, xgHomeDay, playerStats, tacklesFailed, teamLevel(home), matchLevel, rng);
  fillSide(awayXI, goalsAway, xgAwayDay, playerStats, tacklesFailed, teamLevel(away), matchLevel, rng);

  const playerRatings: Record<string, number> = {};
  const playerEnergy: Record<string, number> = {};
  for (const { p } of [...homeXI, ...awayXI]) {
    playerRatings[p.id] = ratingFromStats(playerStats[p.id]!, tacklesFailed[p.id] ?? 0);
    const startEnergy = startFitness(p);
    const drain = C.ENERGY_DRAIN * (1.2 - 0.4 * (stat(p, "stamina") / 10));
    playerEnergy[p.id] = clamp(startEnergy - drain, 0, 100);
  }

  const recording: PlayedMatchRecording = {
    fixtureId: input.fixtureId,
    score: { home: goalsHome, away: goalsAway },
    teamStats: { home: sumTeamStats(homeXI, playerStats), away: sumTeamStats(awayXI, playerStats) },
    playerStats,
    playerRatings,
    playerEnergy,
    substitutions: [],
    durationMs: Math.round(performance.now() - start),
  };

  return { recording, breakdown: { home, away, xgHome, xgAway } };
}
