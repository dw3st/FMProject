import type { ClubMove } from "@/types/pyramidTypes";

// ── Match event ────────────────────────────────────────────────────────────

export interface MatchTeamStats {
  shots:           number;
  passesCompleted: number;
  passesAttempted: number;
  tackles:         number;
  interceptions:   number;
  /** Discipline (`.claude/rules/game-engine/fouls.md`). Optional: older events and quickSim may omit them. */
  fouls?:          number;
  yellowCards?:    number;
  redCards?:       number;
  offsides?:       number;
  penaltiesAwarded?: number;
  /** Goals scored from in-match penalties (part of the score, never extra). */
  penaltyGoals?:   number;
  /** Aerial play (`.claude/rules/game-engine/aerial.md`). Optional: older events may omit them. */
  crosses?:            number;
  crossesCompleted?:   number;
  /** Aerial duels contested by this team (= duels in the match) / won. */
  aerialDuels?:        number;
  aerialDuelsWon?:     number;
  /** Header goals (part of the score). */
  headerGoals?:        number;
  longBalls?:          number;
  longBallsCompleted?: number;
}

export interface MatchPlayerStats {
  passesAttempted: number;
  passesCompleted: number;
  passesFailed:    number;
  shots:           number;
  goals:           number;
  assists:         number;
  interceptions:   number;
  tackles:         number;
}

export interface Scorer {
  playerId:   string;
  playerName: string;
  team:       "home" | "away";
  goals:      number;
}

export interface StatLevelChange {
  stat:     string;
  delta:    1 | -1;
  newValue: number;
}

export interface PlayerDevelopmentChange {
  playerId:   string;
  playerName: string;
  changes:    StatLevelChange[];
}

export interface MatchSubstitution {
  team:           "home" | "away";
  playerOutId:    string;
  playerOutName:  string;
  playerInId:     string;
  playerInName:   string;
  matchMinute:    number;
}

/**
 * One in-match injury (`docs/superpowers/specs/2026-09-28-injuries-design.md` §1 "Na partida").
 * Task 3 (post-match / `advanceDay`) reads these to write `player.injury` with a `returnDate`.
 */
export interface MatchInjury {
  team:        "home" | "away";
  playerId:    string;
  playerName:  string;
  severity:    "light" | "medium" | "severe";
  matchMinute: number;
  /**
   * Energy (0–100) at the moment of injury. Needed for a player removed outright (no subs left)
   * — they never appear in `playerEnergy`/`substitutions` otherwise, so this is the only source
   * for their final in-match energy.
   */
  energy: number;
}

/**
 * One card shown in a match (`docs/superpowers/specs/2026-10-02-fouls-cards-design.md` §3). A second
 * yellow appears as the yellow followed by a red with `secondYellow: true`. Read by the post-match
 * pipeline (`finalizeSquadsAfterMatch`) — suspensions are derived from this list.
 */
export interface MatchCard {
  team:         "home" | "away";
  playerId:     string;
  playerName:   string;
  card:         "yellow" | "red";
  secondYellow: boolean;
  matchMinute:  number;
}

export interface MatchEvent {
  kind:          "match";
  fixtureId:     string;
  competition:   string;
  round:         number;
  home:          string;
  away:          string;
  score:         { home: number; away: number };
  teamStats:     { home: MatchTeamStats; away: MatchTeamStats };
  playerStats:   Record<string, MatchPlayerStats>;
  playerRatings: Record<string, number>;
  /** Maps rosterPlayerId → player name. */
  playerNames:   Record<string, string>;
  /** Maps rosterPlayerId → "home" | "away". */
  playerTeams:   Record<string, "home" | "away">;
  scorers:       Scorer[];
  /** Substitutions made during the match, in chronological order. */
  substitutions: MatchSubstitution[];
  /** In-match injuries, in chronological order. Absent/omitted means none occurred. */
  injuries?: MatchInjury[];
  /** Cards, in chronological order. Absent/omitted means none were shown. */
  cards?: MatchCard[];
  /** Attribute level-ups/downs that occurred this match. */
  developmentChanges: PlayerDevelopmentChange[];
  durationMs:    number;
  /** Knockout only: extra-time goals and shootout (home/away). Absent when decided in 90'. */
  decider?: import("@/types/calendarTypes").MatchDecider;
  /**
   * true when resolved by quickSim (league not followed): playerStats / playerRatings /
   * developmentChanges are empty to keep the day log small. UI must not expect player rows.
   */
  compact?: true;
}

// ── Training event ─────────────────────────────────────────────────────────

export interface TrainingEffect {
  playerId:       string;
  name:           string;
  fitnessDelta:   number;
  trainingPoints: number;
  /** Net DP gained from this training session (only set for players ≤30). */
  dpGained?:      number;
  /** Stat level changes triggered by training DP. Omitted when no levels changed. */
  levelChanges?:  StatLevelChange[];
}

export interface TrainingEvent {
  kind:    "training";
  squadId: string;
  effects: TrainingEffect[];
}

// ── Rest event ─────────────────────────────────────────────────────────────

export interface RestEffect {
  playerId:     string;
  name:         string;
  fitnessDelta: number;
  pointsDelta:  number;
}

export interface RestEvent {
  kind:    "rest";
  squadId: string;
  effects: RestEffect[];
}

// ── Stored variants (disk only — no per-player deltas) ──────────────────────

export type StoredTrainingEvent = Omit<TrainingEvent, "effects">;
export type StoredRestEvent     = Omit<RestEvent, "effects">;

// ── Transfer event (resolved / API-facing) ──────────────────────────────────

export interface TransferEvent {
  kind:        "transfer";
  transferId:  string;
  playerId:    string;
  playerName:  string;
  fromSquadId: string;
  toSquadId:   string;
  fee:         number;  // raw £
  status:      "accepted" | "rejected";
  reason:      string;
}

// ── Transfer ref (stored on disk — compact pointer to transfers.json) ───────

export interface TransferRef {
  kind:       "transfer_ref";
  transferId: string;
}

// ── Stored on disk: TransferRef instead of full TransferEvent ───────────────

export type StoredDayEvent = MatchEvent | StoredTrainingEvent | StoredRestEvent | TransferRef;

export interface StoredDayLog {
  saveId: string;
  date:   string;   // "YYYY-MM-DD"
  events: StoredDayEvent[];
}

// ── API-facing (resolved): full TransferEvent ──────────────────────────────

export type DayEvent = MatchEvent | TrainingEvent | RestEvent | TransferEvent;

export interface DayLog {
  saveId: string;
  date:   string;
  events: DayEvent[];
}

/** `POST /api/advance-day/:saveId` response. */
export interface AdvanceDayResponse extends DayLog {
  newDate: string;
  /** Present (true) on the day the PLAYER's country rolled its season over. */
  seasonEnded?: true;
  /** Season year that was closed. */
  archiveYear?: number;
  /** Every promotion/relegation of the player's country (seasonEnded days only). */
  moves?: ClubMove[];
  /** The human club's own move, or null when it stayed (seasonEnded days only). */
  playerMove?: ClubMove | null;
  /** League the human club won, or null (seasonEnded days only). */
  playerChampionOf?: string | null;
}
