/**
 * Balance Lab — shared types
 *
 * A "scenario" is a multi-pair simulation experiment. Each variant is a
 * (formation, tactic, squad) bundle. The runner takes the cartesian product
 * matches per pair in parallel workers, and aggregates the results.
 */

import type { TacticalStyle, Mentality, TacticalAxes, CustomFormation } from "@/types/tacticsTypes";

// ── Squad spec — how to build the 20-player roster for a side ────────────────

/** Uniform attributes — every player gets the same stat level. */
export interface UniformSquadSpec {
  kind: "uniform";
  /** 1..10 — applied to every attribute. */
  statLevel: number;
}

/**
 * Custom squad with optional per-attribute and per-role overrides.
 * Default attribute level is `statLevel`; any field in `attributes` overrides
 * it globally; any role in `roleOverrides` further overrides per role.
 */
export interface CustomSquadSpec {
  kind: "custom";
  statLevel: number;
  attributes?: Partial<RawAttributes>;
  /** Keyed by detailed role (CB, ST, …). */
  roleOverrides?: Record<string, Partial<RawAttributes>>;
}

export type SquadSpec = UniformSquadSpec | CustomSquadSpec;

// ── Simulation engine ────────────────────────────────────────────────────────

/** Which engine resolves each match. Absent ⇒ "full". */
export type SimEngine = "full" | "quick";

/** All raw attributes a player can carry. Mirrors `RosterPlayer.stats`. */
export interface RawAttributes {
  passing: number;
  vision: number;
  finishing: number;
  dribbling: number;
  speed: number;
  acceleration: number;
  tackling: number;
  pressing: number;
  stamina: number;
  heading: number;
  strength: number;
  reflex: number;
  jump: number;
}

export const RAW_ATTRIBUTE_KEYS: (keyof RawAttributes)[] = [
  "passing", "vision", "finishing", "dribbling",
  "speed", "acceleration", "tackling", "pressing",
  "stamina", "heading", "strength", "reflex", "jump",
];

// ── Variant — one contestant ─────────────────────────────────────────────────

export interface Variant {
  /** Stable id within the scenario (used for matrix indexing). */
  id: string;
  /** Display label. */
  label: string;
  formation: string;        // "4-3-3", "4-4-2", …
  tacticalStyle: TacticalStyle;
  /**
   * Live-match mentality shift layered on top of `tacticalStyle` (see tacticsTypes.ts).
   * Optional — absent (old saved scenarios) is treated as "balanced", the no-op value.
   * This is lab config, not a game save, so no migration code is needed for the field
   * to be missing; consumers must default it themselves.
   */
  mentality?: Mentality;
  /** Axes edited on top of `tacticalStyle`'s bundle (Block C2). Absent = the style's own axes. */
  axesOverride?: Partial<TacticalAxes>;
  /** Free formation (zone grid). When set it replaces `formation` in the engine and quickSim. */
  customFormation?: CustomFormation;
  /**
   * Field the squad with the best order per line, ignoring position fit (`lineOrderLineup`), to
   * measure the loss from out-of-position starters. Absent = fit-aware lineup.
   */
  outOfPosition?: boolean;
  /**
   * Fitness-coach rating 1..10 of this side (`src/Domain/staff`): scales the injury risk (engine and
   * quickSim) and the fitness recovery between congestion games. Absent = the squad's tier-implicit
   * staff, same as in the game for an AI club.
   */
  staffRating?: number;
  squad: SquadSpec;
}

// ── Scenario ─────────────────────────────────────────────────────────────────

/**
 * Fixture congestion: each pair plays `matches` consecutive matches instead of one, applying the
 * fitness/load model (`src/Domain/fitness/fitness.ts`) to both squads between games — `restDays`
 * days of rest, no real day advance. Absent ⇒ no congestion, one independent match per repetition
 * (today's behaviour). See `docs/superpowers/specs/2026-09-27-stamina-design.md` §3.
 */
export interface CongestionSpec {
  /** Games played back-to-back per repetition, ≥ 2 (1 is just "no congestion"). */
  matches: number;
  /** Rest days applied between each game in the sequence (0 = play again the next day). */
  restDays: number;
}

export interface BalanceScenario {
  id: string;              // generated on first save
  name: string;
  description?: string;
  matchesPerPair: number;
  /** Which engine resolves matches for this scenario. Defaults to "full" when absent. */
  simEngine?: SimEngine;
  /** Knockout matches (extra time + penalties). Defaults to false. */
  knockout?: boolean;
  /** Fixture congestion — see `CongestionSpec`. Absent ⇒ no congestion. */
  congestion?: CongestionSpec;
  /** Single pool — every variant plays every other variant once, no self-pairs. */
  variants: Variant[];
}

// ── Worker I/O ───────────────────────────────────────────────────────────────

export interface WorkerInput {
  variantA: Variant;
  variantB: Variant;
  matches: number;
  /** Which engine resolves matches for this pair. Defaults to "full" when absent. */
  simEngine?: SimEngine;
  /** Knockout matches (extra time + penalties). Defaults to false. */
  knockout?: boolean;
  /** Fixture congestion — see `CongestionSpec`. Absent ⇒ no congestion. */
  congestion?: CongestionSpec;
}

/** Raw sums across all N matches for one team. */
export interface TeamRawStats {
  wins: number;
  goals: number;
  shots: number;
  xg: number;
  assists: number;
  passesAttempted: number;
  passesCompleted: number;
  passesFailed: number;
  tackles: number;
  interceptions: number;
  dribblesWon: number;
  dribblesLost: number;
  // Through-ball family — separate from passes; see Statistics.ts.
  throughBallsAttempted: number;
  throughBallsCompleted: number;
  throughBallsLostInFlight: number;
  throughBallsLostInRace: number;
  throughBallsLostInDuel: number;
  looseBallsWon: number;
  switchPlays: number;
  extraTimeMatches: number;
  shootoutsWon: number;
  penaltiesTaken: number;
  penaltiesScored: number;
  /**
   * Sum, across `matches` games, of that game's average end-of-match energy for this team (see
   * `Statistics.ts` → `TeamStats.avgEndEnergy`). Divide by `matches` for the average.
   */
  avgEndEnergySum: number;
  /** Fatigue-driven AI substitutions made by this team, summed across `matches` games. */
  fatigueSubstitutions: number;
  /** In-match injuries suffered by this team, summed across `matches` games. */
  injuries: number;
  /** Starters with `training`/`unsuitable` aptitude for their slot, summed across games. */
  outOfPosition: number;
}

/** One match-in-sequence slice of a congestion run — see `CongestionSpec`. */
export interface CongestionMatchRaw {
  /** 0-based position in the congestion sequence (0 = first match played). */
  matchIndex: number;
  /** Repetitions this slice was summed over (== the pair's `matches`, i.e. `matchesPerPair`). */
  matches: number;
  draws: number;
  teamA: TeamRawStats;
  teamB: TeamRawStats;
}

export interface PairRaw {
  variantAId: string;
  variantBId: string;
  matches: number;
  draws: number;
  durationMs: number;
  teamA: TeamRawStats;
  teamB: TeamRawStats;
  /**
   * Present only when the scenario set `congestion`: one entry per match-in-sequence index. The
   * top-level `teamA`/`teamB`/`matches`/`draws` above remain the OVERALL sums across every game of
   * every repetition (`matches` = `matchesPerPair × congestion.matches`).
   */
  congestionMatches?: CongestionMatchRaw[];
}

export type WorkerMessage =
  | { type: "progress"; variantAId: string; variantBId: string; done: number; total: number }
  | { type: "result"; result: PairRaw };

// ── Aggregated result ────────────────────────────────────────────────────────

export interface PerMatchView {
  wins: number;
  avgGoals: number;
  avgShots: number;
  avgXg: number;
  avgAssists: number;
  shotConversionPct: number;
  avgPassesAttempted: number;
  avgPassesCompleted: number;
  passAccuracyPct: number;
  avgTackles: number;
  avgInterceptions: number;
  avgDribblesWon: number;
  avgDribblesLost: number;
  dribbleSuccessPct: number;
  /** Through-ball attempts per match. */
  avgThroughBalls: number;
  /** Through-ball completion rate (0–100). */
  throughBallCompletionPct: number;
  /** Loose balls won per match. */
  avgLooseBallsWon: number;
  /** Switch-of-play passes played per match. */
  avgSwitchPlays: number;
  /** Share of matches that went to extra time (0–100). */
  extraTimePct: number;
  /** Shootout wins as a share of all matches (0–100). */
  shootoutWinPct: number;
  /** Penalties taken per match (raw count, used to gate the conv% row in the UI). */
  avgPenaltiesTaken: number;
  /** Shootout conversion (0–100). */
  penaltyConversionPct: number;
  /** Average end-of-match energy (0–100) across everyone who appeared for this team. */
  avgEndEnergy: number;
  /** Fatigue-driven AI substitutions per match. */
  avgFatigueSubs: number;
  /** Injuries per match. */
  avgInjuries: number;
  avgOutOfPosition: number;
}

/** One match-in-sequence slice of a congestion run, aggregated to a per-match view. */
export interface CongestionMatchResult {
  matchIndex: number;
  matches: number;
  draws: number;
  teamA: PerMatchView;
  teamB: PerMatchView;
}

export interface PairResult {
  variantAId: string;
  variantBId: string;
  matches: number;
  draws: number;
  teamA: PerMatchView;
  teamB: PerMatchView;
  /** Present only when the scenario set `congestion` — one row per match-in-sequence index. */
  congestion?: CongestionMatchResult[];
}

export interface VariantSummary {
  variantId: string;
  label: string;
  games: number;
  winRate: number;
  drawRate: number;
  lossRate: number;
  avgGoals: number;
  avgShots: number;
  avgXg: number;
  avgAssists: number;
  shotConversionPct: number;
  avgGoalsConceded: number;
  avgShotsConceded: number;
  avgXgConceded: number;
  avgAssistsConceded: number;
  oppShotConversionPct: number;
  avgPassesAttempted: number;
  avgPassesCompleted: number;
  passAccuracyPct: number;
  avgTackles: number;
  avgInterceptions: number;
  avgDribblesWon: number;
  avgDribblesLost: number;
  dribbleSuccessPct: number;
  avgThroughBalls: number;
  throughBallCompletionPct: number;
  avgLooseBallsWon: number;
  avgSwitchPlays: number;
  /** Share of matches that went to extra time (0–100). */
  extraTimePct: number;
  /** Shootout wins as a share of all matches (0–100). */
  shootoutWinPct: number;
  /** Penalties taken per match (raw count, used to gate the conv% row in the UI). */
  avgPenaltiesTaken: number;
  /** Shootout conversion (0–100). */
  penaltyConversionPct: number;
  /** Average end-of-match energy (0–100) across everyone who appeared for this variant. */
  avgEndEnergy: number;
  /** Fatigue-driven AI substitutions per match. */
  avgFatigueSubs: number;
  /** Injuries per match. */
  avgInjuries: number;
  avgOutOfPosition: number;
}

export interface ScenarioResult {
  scenario: BalanceScenario;
  startedAt: string;        // ISO timestamp
  totalDurationMs: number;
  pairs: PairResult[];
  /** Summary per variant, computed across both A-side and B-side appearances. */
  variants: VariantSummary[];
}

// ── Stored index ─────────────────────────────────────────────────────────────

export interface ScenarioIndexEntry {
  id: string;
  name: string;
  startedAt: string;
  matchesPerPair: number;
  variantCount: number;     // |A| + |B| with dedup
  pairCount: number;
  totalDurationMs: number;
  file: string;             // relative path under debug/balance/lab/
}

export interface ScenarioIndex {
  version: 1;
  entries: ScenarioIndexEntry[];
}

// ── Run progress (server-side state) ─────────────────────────────────────────

export interface PairProgress {
  variantAId: string;
  variantBId: string;
  done: number;
  total: number;
  /** "queued" | "running" | "done" | "error" */
  status: "queued" | "running" | "done" | "error";
}

export interface RunStatus {
  runId: string;
  scenario: BalanceScenario;
  startedAt: string;
  pairs: PairProgress[];
  /** Set when finished. */
  completedAt?: string;
  /** Set when finished. */
  resultFile?: string;
  /** Set on error. */
  error?: string;
}
