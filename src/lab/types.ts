/**
 * Balance Lab — shared types
 *
 * A "scenario" is a multi-pair simulation experiment. Each variant is a
 * (formation, tactic, squad) bundle. The runner takes the cartesian product
 * matches per pair in parallel workers, and aggregates the results.
 */

import type { TacticalStyle } from "@/types/tacticsTypes";

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
  squad: SquadSpec;
}

// ── Scenario ─────────────────────────────────────────────────────────────────

export interface BalanceScenario {
  id: string;              // generated on first save
  name: string;
  description?: string;
  matchesPerPair: number;
  /** Single pool — every variant plays every other variant once, no self-pairs. */
  variants: Variant[];
}

// ── Worker I/O ───────────────────────────────────────────────────────────────

export interface WorkerInput {
  variantA: Variant;
  variantB: Variant;
  matches: number;
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
}

export interface PairRaw {
  variantAId: string;
  variantBId: string;
  matches: number;
  draws: number;
  durationMs: number;
  teamA: TeamRawStats;
  teamB: TeamRawStats;
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
}

export interface PairResult {
  variantAId: string;
  variantBId: string;
  matches: number;
  draws: number;
  teamA: PerMatchView;
  teamB: PerMatchView;
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
