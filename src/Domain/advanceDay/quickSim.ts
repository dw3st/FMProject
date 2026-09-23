/**
 * quickSim — statistical match resolution for leagues the player is not following.
 * Pure: same inputs + same rng → same output. Produces a PlayedMatchRecording so the
 * normal post-match pipeline (seasonLog, energy, development) applies unchanged.
 */
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { MatchPlayerStats, MatchTeamStats } from "@/types/dayLogTypes";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import {
  ATTACKING_MID_ROLES,
  DEFENSIVE_MID_ROLES,
  QUICK_SIM_CONFIG as C,
  ROLE_GROUP,
  type LineGroup,
} from "@/GameEngine/Configs/QuickSimConfig";
import { RATING_WEIGHTS } from "@/GameEngine/Configs/PlayerRatingConfig";

export type Rng = () => number;

export interface TeamStrength {
  attack: number;
  midfield: number;
  defense: number;
  goalkeeper: number;
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
}

export interface QuickSimResult {
  recording: PlayedMatchRecording;
  breakdown: QuickSimBreakdown;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function mainRole(p: RosterPlayer): string {
  return p.positions[0] ?? "CM";
}

export function lineGroupOf(p: RosterPlayer): LineGroup {
  return ROLE_GROUP[mainRole(p)] ?? "MID";
}

function stat(p: RosterPlayer, key: string): number {
  return (p.stats as unknown as Record<string, number | undefined>)[key] ?? 0;
}

function fitnessFactor(p: RosterPlayer): number {
  const fitness = p.seasonLog?.fitness ?? 100;
  return 1 - C.FATIGUE_PENALTY * (1 - fitness / 100);
}

function lineValue(players: RosterPlayer[], keys: readonly string[], fallback: RosterPlayer[]): number {
  const pool = players.length ? players : fallback;
  return avg(pool.map((p) => avg(keys.map((k) => stat(p, k))) * fitnessFactor(p))) + C.STRENGTH_FLOOR;
}

export function teamStrength(xi: RosterPlayer[]): TeamStrength {
  const outfield = xi.filter((p) => lineGroupOf(p) !== "GK");
  const role = (p: RosterPlayer) => mainRole(p);
  const attackers = xi.filter(
    (p) => lineGroupOf(p) === "FWD" || (ATTACKING_MID_ROLES as readonly string[]).includes(role(p)),
  );
  const mids = xi.filter((p) => lineGroupOf(p) === "MID");
  const defenders = xi.filter(
    (p) => lineGroupOf(p) === "DEF" || (DEFENSIVE_MID_ROLES as readonly string[]).includes(role(p)),
  );
  const keepers = xi.filter((p) => lineGroupOf(p) === "GK");
  return {
    attack: lineValue(attackers, C.ATTACK_KEYS, outfield),
    midfield: lineValue(mids, C.MIDFIELD_KEYS, outfield),
    defense: lineValue(defenders, C.DEFENSE_KEYS, outfield),
    goalkeeper: keepers.length ? lineValue(keepers, C.GOALKEEPER_KEYS, keepers) : C.STRENGTH_FLOOR,
  };
}

export function expectedGoals(attacker: TeamStrength, defender: TeamStrength, isHome: boolean): number {
  const ratio = (attacker.attack * attacker.midfield) / (defender.defense * defender.goalkeeper);
  return C.BASE_GOALS * Math.pow(ratio, C.STRENGTH_EXPONENT) * (isHome ? C.HOME_ADVANTAGE : 1);
}

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

function emptyStats(): MatchPlayerStats {
  return {
    passesAttempted: 0, passesCompleted: 0, passesFailed: 0,
    shots: 0, goals: 0, assists: 0, interceptions: 0, tackles: 0,
  };
}

export function ratingFromStats(s: MatchPlayerStats): number {
  const W = RATING_WEIGHTS;
  const raw =
    W.BASELINE +
    s.goals * W.GOAL +
    s.assists * W.ASSIST +
    s.shots * W.SHOT +
    s.passesCompleted * W.PASS_COMPLETED +
    s.passesFailed * W.PASS_FAILED +
    s.tackles * W.TACKLE_WON +
    s.interceptions * W.INTERCEPTION;
  return Math.round(clamp(raw, 0, 10) * 10) / 10;
}

function resolveXI(squad: Squad, lineup: string[]): RosterPlayer[] {
  const byId = new Map(squad.players.map((p) => [p.id, p]));
  const xi: RosterPlayer[] = [];
  for (const id of lineup) {
    const p = id ? byId.get(id) : undefined;
    if (p && !xi.includes(p)) xi.push(p);
  }
  return xi;
}

function fillSide(
  xi: RosterPlayer[],
  goals: number,
  xg: number,
  stats: Record<string, MatchPlayerStats>,
  rng: Rng,
): void {
  const scorerWeight = (p: RosterPlayer) => C.ROLE_GOAL_WEIGHT[lineGroupOf(p)] * (0.5 + stat(p, "finishing"));
  const assistWeight = (p: RosterPlayer) => C.ROLE_ASSIST_WEIGHT[lineGroupOf(p)] * (0.5 + stat(p, "passing"));

  for (let g = 0; g < goals; g++) {
    const scorer = weightedPick(xi, scorerWeight, rng);
    if (!scorer) break;
    stats[scorer.id]!.goals++;
    stats[scorer.id]!.shots++;
    if (rng() >= C.NO_ASSIST_RATE) {
      const assister = weightedPick(xi.filter((p) => p.id !== scorer.id), assistWeight, rng);
      if (assister) stats[assister.id]!.assists++;
    }
  }

  const extraShots = samplePoisson(xg * C.SHOTS_PER_XG, rng);
  for (let i = 0; i < extraShots; i++) {
    const shooter = weightedPick(xi, scorerWeight, rng);
    if (shooter) stats[shooter.id]!.shots++;
  }

  for (const p of xi) {
    const group = lineGroupOf(p);
    const s = stats[p.id]!;
    const attempts = samplePoisson(C.PASSES_PER_MATCH[group], rng);
    const rate = C.PASS_COMPLETION_BASE + C.PASS_COMPLETION_SKILL * (stat(p, "passing") / 10);
    let completed = 0;
    for (let i = 0; i < attempts; i++) if (rng() < rate) completed++;
    s.passesAttempted = attempts;
    s.passesCompleted = completed;
    s.passesFailed = attempts - completed;
    s.tackles = samplePoisson(C.TACKLES_PER_MATCH[group] * (0.5 + stat(p, "tackling") / 10), rng);
    s.interceptions = samplePoisson(C.INTERCEPTIONS_PER_MATCH[group] * (0.5 + stat(p, "pressing") / 10), rng);
  }
}

function sumTeamStats(xi: RosterPlayer[], stats: Record<string, MatchPlayerStats>): MatchTeamStats {
  const t: MatchTeamStats = { shots: 0, passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0 };
  for (const p of xi) {
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
  const homeXI = resolveXI(input.home, input.homeLineup);
  const awayXI = resolveXI(input.away, input.awayLineup);

  const home = teamStrength(homeXI);
  const away = teamStrength(awayXI);
  const xgHome = expectedGoals(home, away, true);
  const xgAway = expectedGoals(away, home, false);
  const goalsHome = samplePoisson(xgHome, rng);
  const goalsAway = samplePoisson(xgAway, rng);

  const playerStats: Record<string, MatchPlayerStats> = {};
  for (const p of [...homeXI, ...awayXI]) playerStats[p.id] = emptyStats();
  fillSide(homeXI, goalsHome, xgHome, playerStats, rng);
  fillSide(awayXI, goalsAway, xgAway, playerStats, rng);

  const playerRatings: Record<string, number> = {};
  const playerEnergy: Record<string, number> = {};
  for (const p of [...homeXI, ...awayXI]) {
    playerRatings[p.id] = ratingFromStats(playerStats[p.id]!);
    const startEnergy = p.seasonLog?.fitness ?? 100;
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
