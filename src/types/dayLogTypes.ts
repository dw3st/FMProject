// ── Match event ────────────────────────────────────────────────────────────

export interface MatchTeamStats {
  shots:           number;
  passesCompleted: number;
  passesAttempted: number;
  tackles:         number;
  interceptions:   number;
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
  /** Attribute level-ups/downs that occurred this match. */
  developmentChanges: PlayerDevelopmentChange[];
  durationMs:    number;
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
