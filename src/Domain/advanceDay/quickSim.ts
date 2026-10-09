/**
 * quickSim — statistical match resolution for leagues the player is not following.
 * Pure given its rng: the same inputs + the same rng produce the same output. Determinism
 * (e.g. for tests) requires passing a seeded rng — the default `Math.random` is intentionally
 * non-deterministic for production call sites. Produces a PlayedMatchRecording so the normal
 * post-match pipeline (seasonLog, energy, development) applies unchanged.
 */
import { temperamentFoulMult, temperamentRedMult, temperamentT, temperamentTOf, temperamentYellowMult } from "@/Domain/personality/personality";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { MatchCard, MatchInjury, MatchPlayerStats, MatchTeamStats } from "@/types/dayLogTypes";
import type { PlayedMatchRecording } from "@/Domain/advanceDay/matches";
import { positionFactor } from "@/Domain/positions/positionAptitude";
import { ensureSeasonLog } from "@/Domain/advanceDay/seasonLog";
import { drainMultiplier, matchStartEnergy } from "@/Domain/fitness/fitness";
import { penaltyChance, resolvePenaltyShootout, type PenaltySide } from "@/GameEngine/Infrastructure/PenaltyShootout";
import {
  ATTACKING_MID_ROLES,
  DEFENSIVE_MID_ROLES,
  QUICK_SIM_CONFIG as C,
  ROLE_GROUP,
  type LineGroup,
} from "@/GameEngine/Configs/QuickSimConfig";
import { RATING_WEIGHTS } from "@/GameEngine/Configs/PlayerRatingConfig";
import { contactInjuryChance, injuryRatePerMinute, rollSeverity, type InjuryFactors } from "@/Domain/injury/injury";
import { INJURY } from "@/Domain/injury/injuryConfig";
import { staffEffectsOf } from "@/Domain/staff/staff";
import { familiarityFactor } from "@/Domain/familiarity/familiarity";
import { FAMILIARITY } from "@/Domain/familiarity/familiarityConfig";
import { moraleQuickSimMult } from "@/Domain/morale/morale";
import { pitchInjuryMult } from "@/Domain/facilities/facilityItems";
import { refereeFoulMult, refereeRedMult, refereeYellowMult } from "@/Domain/referees/strictness";

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
  /** Mean raw finishing (0–10) of the forward line. Not part of `teamLevel`. */
  forwardFinishing: number;
}

interface QuickSimBreakdown {
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
  /** Knockout: a level score after 90' goes to extra time (xG × 30/90) and then penalties. */
  knockout?: boolean;
  /** Two-legged tie: first-leg goals, home/away of THIS match. Level = today's score + aggregate. */
  aggregate?: { home: number; away: number };
  /** Neutral venue: no home advantage for either side. */
  neutral?: boolean;
  /**
   * Familiarity (0..100) of each side with the style it plays (`src/Domain/familiarity`): line
   * strengths × (1 + QUICKSIM_STRENGTH × familiarityFactor). Absent = neutral (no change).
   */
  homeFamiliarity?: number;
  awayFamiliarity?: number;
  /**
   * Morale (0..100) of a whole side (`src/Domain/morale`, the lab): line strengths × (1 + 0.02 ×
   * moraleFactor). Absent = neutral — the day advance never passes it (quickSim is AI × AI only).
   */
  homeMorale?: number;
  awayMorale?: number;
  /**
   * Temperament (1..20) of a whole side (`src/Domain/personality`, the lab and `/test`). Absent =
   * each player's own (derived from his id): fouls and cards scale with it.
   */
  homeTemperament?: number;
  awayTemperament?: number;
  /**
   * Condition 0..100 of the match pitch (`src/Domain/facilities/pitch.ts`): below 40% it
   * multiplies both sides' injury risk (× 1.6 at 0%). Absent = 90 (no change, no extra draw).
   */
  pitchCondition?: number;
  /** Referee rigor −1..1 (`src/Domain/referees`): fouls, penalties and cards of both sides. Absent / 0 = no change. */
  refereeStrictness?: number;
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
  /** Out-of-position multiplier on the player's attributes in this slot (`POSITION_PENALTY`). */
  k: number;
}

function xiPlayer(p: RosterPlayer, slotRole?: string): XIPlayer {
  const role = resolveRole(p, slotRole);
  return { p, role, k: positionFactor(p, role) };
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

/**
 * Match start energy — persisted fitness compressed toward the reference matchday fitness
 * (`matchStartEnergy`, same helper the full engine uses to build starters/bench — see
 * `.claude/rules/non-player-games.md` → "Fadiga"), NOT raw fitness. Used both as the base the
 * in-match drain subtracts from (below) and as the fitness fed into `fitnessFactor`'s strength
 * penalty, so quickSim's team-strength estimate is consistent with what the full engine would
 * actually play the match at.
 */
function startFitness(p: RosterPlayer): number {
  return matchStartEnergy(ensureSeasonLog(p).seasonLog!.fitness);
}

/** Accumulated fatigue load at kickoff (`seasonLog.load`, minutes-equivalent) — see `drainMultiplier`. */
function startLoad(p: RosterPlayer): number {
  return ensureSeasonLog(p).seasonLog!.load ?? 0;
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
  return avg(pool.map(({ p, k }) => paceOf(p) * k));
}

/** Raw finishing, no fitness or position factor (how FINISHING_WEIGHT was fitted). */
function lineFinishing(players: XIPlayer[], fallback: XIPlayer[]): number {
  const pool = players.length ? players : fallback;
  return avg(pool.map(({ p }) => stat(p, "finishing")));
}

function lineValue(players: XIPlayer[], keys: readonly string[], fallback: XIPlayer[]): number {
  const pool = players.length ? players : fallback;
  return avg(pool.map(({ p, k }) => avg(keys.map((key) => stat(p, key))) * fitnessFactor(p) * k)) + C.STRENGTH_FLOOR;
}

/** `roles`, when given, is aligned with `players` (the slot role each one plays). */
export function teamStrength(players: RosterPlayer[], roles?: string[]): TeamStrength {
  return strengthOf(players.map((p, i) => xiPlayer(p, roles?.[i])));
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
    forwardFinishing: lineFinishing(xi.filter((x) => groupOf(x) === "FWD"), attackers.length ? attackers : outfield),
  };
}

/** Style familiarity scales the four line strengths (not pace); 50 / absent = unchanged. */
function withFamiliarity(s: TeamStrength, familiarity: number | undefined): TeamStrength {
  const f = familiarityFactor(familiarity);
  if (f === 0) return s;
  const k = 1 + FAMILIARITY.QUICKSIM_STRENGTH * f;
  return { ...s, attack: s.attack * k, midfield: s.midfield * k, defense: s.defense * k, goalkeeper: s.goalkeeper * k };
}

/** Side morale scales the four line strengths (not pace); 65 / absent = unchanged. */
function withMorale(s: TeamStrength, morale: number | undefined): TeamStrength {
  const k = moraleQuickSimMult(morale);
  if (k === 1) return s;
  return { ...s, attack: s.attack * k, midfield: s.midfield * k, defense: s.defense * k, goalkeeper: s.goalkeeper * k };
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
 * the engine's through-ball races are decided by sprint speed. The forward line's finishing
 * scales conversion (the engine's shooter effect spans 0.96–1.36 of xG).
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
    Math.exp(C.FINISHING_WEIGHT * (attacker.forwardFinishing - C.FINISHING_REF)) *
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
export function ratingFromStats(s: MatchPlayerStats, tacklesFailed = 0, group?: LineGroup): number {
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
  // #9: shrink toward the line's centre so the slot-carrying starter's tail matches the engine's.
  const k = group ? C.RATING_SHRINK[group] : 1;
  const c = group ? C.RATING_SHRINK_CENTER[group] : 0;
  const shaped = k === 1 ? raw : c + (raw - c) * k;
  return Math.round(clamp(shaped, 0, 10) * 10) / 10;
}

/** Skips empty / unknown / duplicate ids; each kept player takes the role of his own slot index. */
function resolveXI(squad: Squad, lineup: string[], roles?: string[]): XIPlayer[] {
  const byId = new Map(squad.players.map((p) => [p.id, p]));
  const xi: XIPlayer[] = [];
  lineup.forEach((id, i) => {
    const p = id ? byId.get(id) : undefined;
    if (p && !xi.some((x) => x.p === p)) xi.push(xiPlayer(p, roles?.[i]));
  });
  return xi;
}

/** One sampled goal: its scorer and (optional) assister — kept so a goal later turned into a penalty
 *  goal by `rollDiscipline` can move to the taker and drop its assist. */
interface GoalRecord {
  scorerId: string;
  assisterId: string | null;
  /** Turned into a penalty goal by `rollDiscipline` (never a header). */
  penalty?: boolean;
  /** Turned into a header goal by `rollAerial`. */
  header?: boolean;
}

function assignGoals(xi: XIPlayer[], goals: number, stats: Record<string, MatchPlayerStats>, rng: Rng): GoalRecord[] {
  const scorerWeight = (x: XIPlayer) => C.ROLE_GOAL_WEIGHT[groupOf(x)] * (0.5 + stat(x.p, "finishing") / 10);
  const assistWeight = (x: XIPlayer) => C.ROLE_ASSIST_WEIGHT[groupOf(x)] * (0.5 + stat(x.p, "passing") / 10);
  const records: GoalRecord[] = [];
  for (let g = 0; g < goals; g++) {
    const scorer = weightedPick(xi, scorerWeight, rng) ?? uniformPick(xi, rng);
    if (!scorer) break;
    stats[scorer.p.id]!.goals++;
    stats[scorer.p.id]!.shots++;
    let assisterId: string | null = null;
    if (rng() >= C.NO_ASSIST_RATE) {
      const assister = weightedPick(xi.filter((x) => x.p.id !== scorer.p.id), assistWeight, rng);
      if (assister) {
        stats[assister.p.id]!.assists++;
        assisterId = assister.p.id;
      }
    }
    records.push({ scorerId: scorer.p.id, assisterId });
  }
  return records;
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
): GoalRecord[] {
  const scorerWeight = (x: XIPlayer) => C.ROLE_GOAL_WEIGHT[groupOf(x)] * (0.5 + stat(x.p, "finishing") / 10);

  const goalRecords = assignGoals(xi, goals, stats, rng);

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
  return goalRecords;
}

/**
 * In-match injuries for one side, no substitutions (`docs/superpowers/archive/2026-09-28-
 * injuries.md` Task 3): every XI player is treated as playing the full `minutesTotal` (quickSim
 * has no bench swap), so this is the only place an injury can remove a player from a quickSim
 * match — it never actually does (no lineup change), it just records the event and severity for
 * the post-match / inbox pipeline (`matches.ts` → `finalizeSquadsAfterMatch`).
 *
 * Same per-minute risk as the engine (`injuryRatePerMinute`, using this match's start
 * energy/load — `startFitness`/`startLoad` — and age/strength), modelled as a Poisson count over
 * the minutes played. Approximates the engine's tackle/duel contact risk with a per-player
 * contact-event count (`tackles` won + failed tackle attempts — quickSim has no loose-ball duels
 * and only sees the tackler's side of each attempt), scaled by `QUICKSIM_CONTACT_SCALE` so the
 * overall volume matches the engine's (calibrated by `scripts/injury-calibrate.ts --quicksim`).
 */
function rollSideInjuries(
  xi: XIPlayer[],
  team: "home" | "away",
  stats: Record<string, MatchPlayerStats>,
  tacklesFailed: Record<string, number>,
  minutesTotal: number,
  rng: Rng,
  staffMult = 1,
): MatchInjury[] {
  const injuries: MatchInjury[] = [];
  for (const { p } of xi) {
    const factors: InjuryFactors = {
      energy: startFitness(p),
      load: startLoad(p),
      age: p.age,
      strength: stat(p, "strength"),
      staffMult,
    };
    const contactEvents = (stats[p.id]?.tackles ?? 0) + (tacklesFailed[p.id] ?? 0);
    const lambda =
      injuryRatePerMinute(factors) * minutesTotal +
      contactInjuryChance(factors) * contactEvents * INJURY.QUICKSIM_CONTACT_SCALE;
    if (samplePoisson(lambda, rng) < 1) continue;
    injuries.push({
      team,
      playerId: p.id,
      playerName: p.name,
      severity: rollSeverity(rng),
      matchMinute: 1 + Math.floor(rng() * minutesTotal),
      // quickSim never actually benches a player (no lineup change — see the doc comment above),
      // so there's no separate "energy at the moment of injury" to capture; use the same
      // start-of-match energy the risk roll itself used (`factors.energy`).
      energy: factors.energy,
    });
  }
  return injuries;
}

/** Per-side discipline totals (team stats). */
interface SideDiscipline {
  fouls: number;
  yellowCards: number;
  redCards: number;
  offsides: number;
  penaltiesAwarded: number;
  penaltyGoals: number;
}

/**
 * Discipline (Etapa 12, `.claude/rules/game/discipline.md`): `xi` commits the fouls; `opp` is the
 * side that suffers them (and is awarded the penalties and the offside calls are counted for it).
 * Penalties keep the already-sampled goal volume: each of `opp`'s regular goals becomes a penalty
 * goal with probability `q = λ·c / xG`, and missed penalties are a separate Poisson (`λ·(1 − c)`),
 * so `E[penalty goals] = λ·c`, `E[awarded] = λ`, and the score never changes. A converted goal
 * moves from its scorer to the penalty taker and loses its assist (a penalty goal has none, as in
 * the engine's `resolveInMatchPenalty`). `oppGoals` are `opp`'s regular-time goals (no extra time).
 */
function rollDiscipline(
  xi: XIPlayer[],
  team: "home" | "away",
  opp: XIPlayer[],
  oppGoals: GoalRecord[],
  oppXg: number,
  oppLevel: number,
  minutesTotal: number,
  stats: Record<string, MatchPlayerStats>,
  ratingDelta: Record<string, number>,
  cards: MatchCard[],
  rng: Rng,
  temperamentOverride?: number,
  refereeStrictness?: number,
): { committed: number; yellow: number; red: number; oppPenalties: number; oppPenaltyGoals: number; oppOffsides: number } {
  const W = RATING_WEIGHTS;
  const out = { committed: 0, yellow: 0, red: 0, oppPenalties: 0, oppPenaltyGoals: 0, oppOffsides: 0 };
  if (xi.length === 0 || opp.length === 0) return out;

  // Penalties for `opp` (fouls by `xi` in its own box).
  const outfieldOpp = opp.filter((x) => groupOf(x) !== "GK");
  const taker = [...outfieldOpp].sort((a, b) => stat(b.p, "finishing") - stat(a.p, "finishing"))[0];
  const gk = xi.find((x) => groupOf(x) === "GK");
  const keeper = gk ? { id: gk.p.id, reflex: stat(gk.p, "reflex") / 10, diving: stat(gk.p, "jump") / 10 } : null;
  const c = taker ? penaltyChance(Math.min(0.95, stat(taker.p, "finishing") / 10), keeper) : 0;
  // Referee rigor (`referees.md`): more fouls, so more penalties too (the score never changes). s = 0 → × 1.
  const refFoul = refereeFoulMult(refereeStrictness);
  const lam = C.PENALTIES_PER_SIDE * refFoul;
  const converted: GoalRecord[] = [];
  if (taker && oppGoals.length > 0) {
    const q = Math.min(0.9, (lam * c) / Math.max(oppXg, lam * c));
    for (const goal of oppGoals) if (rng() < q) converted.push(goal);
  }
  const penaltyGoals = converted.length;
  const missed = taker ? samplePoisson(lam * (1 - c), rng) : 0;
  for (const goal of converted) {
    goal.penalty = true;
    if (goal.assisterId) stats[goal.assisterId]!.assists--;
    if (goal.scorerId !== taker!.p.id) {
      stats[goal.scorerId]!.goals--;
      stats[goal.scorerId]!.shots--;
      stats[taker!.p.id]!.goals++;
      stats[taker!.p.id]!.shots++;
    }
  }
  if (taker) stats[taker.p.id]!.shots += missed;
  out.oppPenalties = penaltyGoals + missed;
  out.oppPenaltyGoals = penaltyGoals;

  out.oppOffsides = samplePoisson(C.OFFSIDES_PER_SIDE * Math.pow(oppLevel / C.LEVEL_REF, C.OFFSIDE_LEVEL_EXPONENT), rng);

  // Temperament (`personality.md`): hot-heads foul more (the side's count and the pick) and are
  // booked more per foul. A neutral XI (t = 0) draws exactly what it did before.
  const overrideT = temperamentTOf(temperamentOverride);
  const tempT = new Map(xi.map((x) => [x.p.id, overrideT ?? temperamentT(x.p)]));
  const foulMult = (x: XIPlayer) => temperamentFoulMult(tempT.get(x.p.id) ?? 0);
  const sideFoulMult = avg(xi.map(foulMult)) / C.TEMPERAMENT_FOUL_NORM;
  const cardMult = (mult: (t: number) => number, id: string) => {
    const tt = tempT.get(id) ?? 0;
    return tt === 0 ? 1 : mult(tt) / C.TEMPERAMENT_CARD_NORM;
  };

  // Fouls by `xi` (penalty fouls included), in minute order so a second yellow follows the first.
  const n = Math.max(samplePoisson(C.FOULS_PER_SIDE * sideFoulMult * refFoul, rng), out.oppPenalties);
  const minutes = Array.from({ length: n }, () => 1 + Math.floor(rng() * minutesTotal)).sort((a, b) => a - b);
  const booked = new Set<string>();
  const sentOff = new Set<string>();
  const weight = (x: XIPlayer) =>
    C.FOUL_LINE_WEIGHT[groupOf(x)] * Math.max(0.2, 1 + 0.6 * (0.5 - stat(x.p, "tackling") / 10)) *
    (booked.has(x.p.id) ? C.BOOKED_FOUL_MULT : 1) * foulMult(x);
  const penaltyFoulIdx = new Set<number>();
  while (penaltyFoulIdx.size < out.oppPenalties) penaltyFoulIdx.add(Math.floor(rng() * n));
  minutes.forEach((minute, i) => {
    const pool = xi.filter((x) => !sentOff.has(x.p.id));
    const fouler = weightedPick(pool, weight, rng);
    if (!fouler) return;
    out.committed++;
    const id = fouler.p.id;
    const add = (d: number) => { ratingDelta[id] = (ratingDelta[id] ?? 0) + d; };
    if (penaltyFoulIdx.has(i)) add(W.PENALTY_CONCEDED);
    const card = (kind: "yellow" | "red", secondYellow: boolean) =>
      cards.push({ team, playerId: id, playerName: fouler.p.name, card: kind, secondYellow, matchMinute: minute });
    if (rng() < C.DIRECT_RED_PER_FOUL * cardMult(temperamentRedMult, id) * refereeRedMult(refereeStrictness)) {
      card("red", false);
      sentOff.add(id);
      out.red++;
      add(W.RED_CARD);
      return;
    }
    const wasBooked = booked.has(id);
    if (rng() < C.YELLOW_PER_FOUL * (wasBooked ? C.BOOKED_CARD_MULT : 1) * cardMult(temperamentYellowMult, id) * refereeYellowMult(refereeStrictness)) {
      card("yellow", false);
      out.yellow++;
      add(W.YELLOW_CARD);
      if (wasBooked) {
        card("red", true);
        sentOff.add(id);
        out.red++;
        add(W.RED_CARD);
      } else {
        booked.add(id);
      }
    }
  });
  return out;
}

/** Per-side aerial totals (team stats). */
interface SideAerial {
  crosses: number;
  crossesCompleted: number;
  aerialDuels: number;
  aerialDuelsWon: number;
  headerGoals: number;
  longBalls: number;
  longBallsCompleted: number;
}

function binomial(n: number, p: number, rng: Rng): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng() < p) k++;
  return k;
}

/** Mean aerial ability of an XI (heading / jump / strength, 0..10), the engine's duel weights. */
function aerialStrength(xi: XIPlayer[]): number {
  const outfield = xi.filter((x) => groupOf(x) !== "GK");
  return avg(outfield.map((x) => 0.45 * stat(x.p, "heading") + 0.25 * stat(x.p, "jump") + 0.15 * stat(x.p, "strength"))) + 0.5;
}

/**
 * Aerial play for one side (Etapa 13, `.claude/rules/game-engine/aerial.md`): crosses / long balls
 * by Poisson and binomial completion, the side's share `won` of the match's `duels` handed to
 * players by line weight × heading (each won duel = RATING_WEIGHTS.AERIAL_DUEL_WON), and header
 * goals: each non-penalty goal already sampled is a header with probability
 * HEADER_GOAL_SHARE × goals / eligible, moved to a header scorer (the assist is kept unless it was
 * his own). The score never changes.
 */
function rollAerial(
  xi: XIPlayer[],
  goals: GoalRecord[],
  duels: number,
  won: number,
  stats: Record<string, MatchPlayerStats>,
  ratingDelta: Record<string, number>,
  rng: Rng,
): SideAerial {
  const out: SideAerial = {
    crosses: 0, crossesCompleted: 0, aerialDuels: duels, aerialDuelsWon: won,
    headerGoals: 0, longBalls: 0, longBallsCompleted: 0,
  };
  if (xi.length === 0) return out;
  out.crosses = samplePoisson(C.CROSSES_PER_SIDE, rng);
  out.crossesCompleted = binomial(out.crosses, C.CROSS_COMPLETION, rng);
  out.longBalls = samplePoisson(C.LONG_BALLS_PER_SIDE, rng);
  out.longBallsCompleted = binomial(out.longBalls, C.LONG_BALL_COMPLETION, rng);

  const duelWeight = (x: XIPlayer) => C.AERIAL_DUEL_LINE_WEIGHT[groupOf(x)] * (0.5 + stat(x.p, "heading") / 10);
  for (let i = 0; i < won; i++) {
    const p = weightedPick(xi, duelWeight, rng);
    if (p) ratingDelta[p.p.id] = (ratingDelta[p.p.id] ?? 0) + RATING_WEIGHTS.AERIAL_DUEL_WON;
  }

  const eligible = goals.filter((g) => !g.penalty);
  if (eligible.length === 0) return out;
  const q = Math.min(1, (C.HEADER_GOAL_SHARE * goals.length) / eligible.length);
  const headerWeight = (x: XIPlayer) => C.HEADER_LINE_WEIGHT[groupOf(x)] * (0.5 + stat(x.p, "heading") / 10);
  for (const goal of eligible) {
    if (rng() >= q) continue;
    const header = weightedPick(xi, headerWeight, rng);
    if (!header) continue;
    out.headerGoals++;
    goal.header = true;
    const id = header.p.id;
    if (id === goal.scorerId) continue;
    stats[goal.scorerId]!.goals--;
    stats[goal.scorerId]!.shots--;
    stats[id]!.goals++;
    stats[id]!.shots++;
    if (goal.assisterId === id) {
      stats[id]!.assists--;
      goal.assisterId = null;
    }
    goal.scorerId = id;
  }
  return out;
}

/** Per-side set-piece totals (team stats). */
interface SideSetPieces {
  corners: number;
  freeKicks: number;
  directFreeKickShots: number;
  directFreeKickGoals: number;
  setPieceGoals: number;
}

/** Moves `goal` to `toId` (keeps the assist unless it was his own or `dropAssist`). */
function moveGoal(goal: GoalRecord, toId: string, stats: Record<string, MatchPlayerStats>, dropAssist: boolean): void {
  if (goal.scorerId !== toId) {
    stats[goal.scorerId]!.goals--;
    stats[goal.scorerId]!.shots--;
    stats[toId]!.goals++;
    stats[toId]!.shots++;
  }
  if (goal.assisterId && (dropAssist || goal.assisterId === toId)) {
    stats[goal.assisterId]!.assists--;
    goal.assisterId = null;
  }
  goal.scorerId = toId;
}

/**
 * Set pieces for one side (Etapa 14, `.claude/rules/game-engine/set-pieces-play.md`): corners and
 * direct free-kick shots by Poisson, free kicks = the opponent's fouls that were not penalties. Of the
 * side's non-penalty goals already sampled, a share become set-piece goals so that
 * E[non-penalty set-piece goals] = SET_PIECE_GOAL_SHARE × goals: a DIRECT_FK_GOAL_SHARE / SET_PIECE_GOAL_SHARE
 * part are direct free kicks (moved to the best finisher, no assist; a header picked here stops being one, so
 * E[direct] = DIRECT_FK_GOAL_SHARE × goals), the rest keep a header's scorer
 * or move to a heading-weighted defender / forward. Penalty goals count as set-piece goals. The score
 * never changes.
 */
function rollSetPieces(
  xi: XIPlayer[],
  goals: GoalRecord[],
  oppFouls: number,
  penaltiesAwarded: number,
  stats: Record<string, MatchPlayerStats>,
  rng: Rng,
  /** Incremented for each header goal turned into a direct free kick (the caller fixes headerGoals). */
  headersToDirect: { value: number } = { value: 0 },
): SideSetPieces {
  const out: SideSetPieces = { corners: 0, freeKicks: 0, directFreeKickShots: 0, directFreeKickGoals: 0, setPieceGoals: 0 };
  if (xi.length === 0) return out;
  out.corners = samplePoisson(C.CORNERS_PER_SIDE, rng);
  out.freeKicks = Math.max(0, oppFouls - penaltiesAwarded);
  out.setPieceGoals = goals.filter((g) => g.penalty).length;
  const eligible = goals.filter((g) => !g.penalty);
  if (eligible.length > 0) {
    const q = Math.min(0.9, (C.SET_PIECE_GOAL_SHARE * goals.length) / eligible.length);
    // Any set-piece goal may be the direct free kick (a header picked here stops being a header),
    // so E[direct free-kick goals] = DIRECT_FK_GOAL_SHARE × goals exactly.
    const directShare = C.DIRECT_FK_GOAL_SHARE / C.SET_PIECE_GOAL_SHARE;
    const outfield = xi.filter((x) => groupOf(x) !== "GK");
    const taker = [...outfield].sort((a, b) => stat(b.p, "finishing") - stat(a.p, "finishing"))[0];
    const spWeight = (x: XIPlayer) => C.SET_PIECE_LINE_WEIGHT[groupOf(x)] * (0.5 + stat(x.p, "heading") / 10);
    for (const goal of eligible) {
      if (rng() >= q) continue;
      out.setPieceGoals++;
      if (taker && rng() < directShare) {
        out.directFreeKickGoals++;
        if (goal.header) {
          goal.header = false;
          headersToDirect.value++;
        }
        moveGoal(goal, taker.p.id, stats, true);
        continue;
      }
      if (goal.header) continue;
      const scorer = weightedPick(xi, spWeight, rng);
      if (scorer) moveGoal(goal, scorer.p.id, stats, false);
    }
  }
  out.directFreeKickShots = Math.max(samplePoisson(C.DIRECT_FK_SHOTS_PER_SIDE, rng), out.directFreeKickGoals);
  return out;
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

function shootoutSide(xi: XIPlayer[]): PenaltySide<string> {
  const gk = xi.find((x) => groupOf(x) === "GK");
  return {
    takers: xi.map((x) => ({
      id: x.p.id,
      accuracy: groupOf(x) === "GK" ? 0 : Math.min(0.95, stat(x.p, "finishing") / 10),
      isGK: groupOf(x) === "GK",
    })),
    keeper: gk ? { id: gk.p.id, reflex: stat(gk.p, "reflex") / 10, diving: stat(gk.p, "jump") / 10 } : null,
  };
}

export function quickSimMatch(input: QuickSimInput, rng: Rng = Math.random): QuickSimResult {
  const start = performance.now();
  const homeXI = resolveXI(input.home, input.homeLineup, input.homeRoles);
  const awayXI = resolveXI(input.away, input.awayLineup, input.awayRoles);

  const home = withMorale(withFamiliarity(strengthOf(homeXI), input.homeFamiliarity), input.homeMorale);
  const away = withMorale(withFamiliarity(strengthOf(awayXI), input.awayFamiliarity), input.awayMorale);
  const xgHome = expectedGoals(home, away, !input.neutral);
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
  let goalsHome = homeXI.length > 0 ? sampleGoals(xgHomeDay, rng) : 0;
  let goalsAway = awayXI.length > 0 ? sampleGoals(xgAwayDay, rng) : 0;

  const playerStats: Record<string, MatchPlayerStats> = {};
  const tacklesFailed: Record<string, number> = {};
  for (const { p } of [...homeXI, ...awayXI]) playerStats[p.id] = emptyStats();
  const matchLevel = (teamLevel(home) + teamLevel(away)) / 2;
  const homeGoals = fillSide(homeXI, goalsHome, xgHomeDay, playerStats, tacklesFailed, teamLevel(home), matchLevel, rng);
  const awayGoals = fillSide(awayXI, goalsAway, xgAwayDay, playerStats, tacklesFailed, teamLevel(away), matchLevel, rng);

  let decider: PlayedMatchRecording["decider"];
  // Extra-time goals: not offered to the penalty conversion, but can be headers (`rollAerial`).
  const homeEtGoals: GoalRecord[] = [];
  const awayEtGoals: GoalRecord[] = [];
  const agg = input.aggregate ?? { home: 0, away: 0 };
  const levelNow = () => goalsHome + agg.home === goalsAway + agg.away;
  if (input.knockout && levelNow()) {
    const etHome = homeXI.length > 0 ? sampleGoals(xgHomeDay * (30 / 90), rng) : 0;
    const etAway = awayXI.length > 0 ? sampleGoals(xgAwayDay * (30 / 90), rng) : 0;
    homeEtGoals.push(...assignGoals(homeXI, etHome, playerStats, rng));
    awayEtGoals.push(...assignGoals(awayXI, etAway, playerStats, rng));
    goalsHome += etHome;
    goalsAway += etAway;
    decider = { extraTime: { home: etHome, away: etAway } };
    if (levelNow()) {
      const so = resolvePenaltyShootout(shootoutSide(homeXI), shootoutSide(awayXI), rng);
      decider.penalties = { home: so.score.A, away: so.score.B };
    }
  }

  // Same total-minutes convention as the extra-time energy drain above (120' once ET was played).
  const totalMinutes = decider?.extraTime ? 120 : 90;
  // Match pitch (Etapa 34): × both sides' injury risk below 40%; 90 / absent = × 1, same draws.
  const pitchMult = pitchInjuryMult(input.pitchCondition ?? 90);
  const injuries = [
    ...rollSideInjuries(homeXI, "home", playerStats, tacklesFailed, totalMinutes, rng, staffEffectsOf(input.home).injuryMult * pitchMult),
    ...rollSideInjuries(awayXI, "away", playerStats, tacklesFailed, totalMinutes, rng, staffEffectsOf(input.away).injuryMult * pitchMult),
  ].sort((a, b) => a.matchMinute - b.matchMinute);

  // Discipline last, so every earlier rng draw (goals, events, injuries) is unchanged by it.
  const cards: MatchCard[] = [];
  const ratingDelta: Record<string, number> = {};
  const homeDisc = rollDiscipline(homeXI, "home", awayXI, awayGoals, xgAwayDay,
    teamLevel(away), totalMinutes, playerStats, ratingDelta, cards, rng, input.homeTemperament, input.refereeStrictness);
  const awayDisc = rollDiscipline(awayXI, "away", homeXI, homeGoals, xgHomeDay,
    teamLevel(home), totalMinutes, playerStats, ratingDelta, cards, rng, input.awayTemperament, input.refereeStrictness);
  cards.sort((a, b) => a.matchMinute - b.matchMinute);

  // Aerial play last (`aerial.md`), so every earlier rng draw is unchanged by it.
  const duels = homeXI.length > 0 && awayXI.length > 0 ? samplePoisson(C.AERIAL_DUELS_PER_MATCH, rng) : 0;
  const aH = aerialStrength(homeXI);
  const aA = aerialStrength(awayXI);
  const homeDuelsWon = binomial(duels, aH / (aH + aA), rng);
  const homeAir = rollAerial(homeXI, [...homeGoals, ...homeEtGoals], duels, homeDuelsWon, playerStats, ratingDelta, rng);
  const awayAir = rollAerial(awayXI, [...awayGoals, ...awayEtGoals], duels, duels - homeDuelsWon, playerStats, ratingDelta, rng);
  // Set pieces last (`set-pieces-play.md`), so every earlier rng draw is unchanged by them.
  const homeHeadersToDirect = { value: 0 };
  const awayHeadersToDirect = { value: 0 };
  const homeSet = rollSetPieces(homeXI, [...homeGoals, ...homeEtGoals], awayDisc.committed, awayDisc.oppPenalties, playerStats, rng, homeHeadersToDirect);
  const awaySet = rollSetPieces(awayXI, [...awayGoals, ...awayEtGoals], homeDisc.committed, homeDisc.oppPenalties, playerStats, rng, awayHeadersToDirect);
  homeAir.headerGoals -= homeHeadersToDirect.value;
  awayAir.headerGoals -= awayHeadersToDirect.value;
  const sideDisc = (own: typeof homeDisc, other: typeof homeDisc): SideDiscipline => ({
    fouls: own.committed, yellowCards: own.yellow, redCards: own.red,
    offsides: other.oppOffsides, penaltiesAwarded: other.oppPenalties, penaltyGoals: other.oppPenaltyGoals,
  });

  // Extra time (30' on top of 90') drains the whole XI proportionally longer, same as the
  // full engine's match-minute tracking treats 120' matches.
  const extraTimeMult = decider?.extraTime ? 4 / 3 : 1;
  const playerRatings: Record<string, number> = {};
  const playerEnergy: Record<string, number> = {};
  for (const x of [...homeXI, ...awayXI]) {
    const { p } = x;
    const base = ratingFromStats(playerStats[p.id]!, tacklesFailed[p.id] ?? 0, groupOf(x));
    const delta = ratingDelta[p.id] ?? 0;
    playerRatings[p.id] = delta === 0 ? base : Math.round(clamp(base + delta, 0, 10) * 10) / 10;
    const startEnergy = startFitness(p);
    const drain =
      C.ENERGY_DRAIN_BY_LINE[groupOf(x)] *
      (1.2 - 0.4 * (stat(p, "stamina") / 10)) *
      drainMultiplier(startLoad(p)) *
      extraTimeMult;
    playerEnergy[p.id] = clamp(startEnergy - drain, 0, 100);
  }


  const recording: PlayedMatchRecording = {
    fixtureId: input.fixtureId,
    score: { home: goalsHome, away: goalsAway },
    teamStats: {
      home: { ...sumTeamStats(homeXI, playerStats), ...sideDisc(homeDisc, awayDisc), ...homeAir, ...homeSet },
      away: { ...sumTeamStats(awayXI, playerStats), ...sideDisc(awayDisc, homeDisc), ...awayAir, ...awaySet },
    },
    playerStats,
    playerRatings,
    playerEnergy,
    substitutions: [],
    durationMs: Math.round(performance.now() - start),
    ...(decider ? { decider } : {}),
    ...(injuries.length > 0 ? { injuries } : {}),
    ...(cards.length > 0 ? { cards } : {}),
  };

  return { recording, breakdown: { home, away, xgHome, xgAway } };
}
