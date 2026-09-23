import type { PlayerSeasonLog, StandingRow } from "@/types/playerTypes";

export interface Fixture {
  id:          string;          // e.g. "fix_0001"
  date:        string;
  competition: string;
  round:       number;
  home:        string;          // squadId
  away:        string;          // squadId
  played:      boolean;
  result:      { home: number; away: number } | null;
}

export interface SeasonData {
  year:     number;
  start:    string;
  end:      string;
  calendar: Fixture[];
  /**
   * ISO dates that are rest days (recovery, no training).
   * Pre-seeded with the day before and after each match date.
   * Players can toggle future non-game days between "training" and "rest".
   */
  restDays?: string[];
}

export interface SeasonTitle {
  competition: string;
  clubId:      string;
  clubName:    string;
  /** Primary key when present in squad data. Always persist when available. */
  coachId:     number | null;
  /** Display / fallback from squad.coach.name */
  coachName:   string;
}

/** Snapshot of a completed season (archived under saves/{id}/seasons/{year}/). */
export interface SeasonArchive {
  leagueSlug: string;   // which league this archive belongs to
  year:       number;
  start:      string;
  end:        string;
  calendar?:  Fixture[];   // kept optional for old archives; new archives omit it
  standings:  StandingRow[];
  titles:     SeasonTitle[];
  /** Every player's season log at season end, keyed by player id. */
  playerLogs: Record<string, PlayerSeasonLog>;
}

// --- NEW MULTI-LEAGUE TYPES ---

/** Lightweight season metadata for one league (replaces SeasonData as the per-league store) */
export interface LeagueSeasonMeta {
  leagueSlug:   string;
  year:         number;
  start:        string;   // "YYYY-MM-DD"
  end:          string;   // "YYYY-MM-DD"
  totalRounds:  number;
  /** Rest days for the player's league (shown in training calendar UI) */
  restDays?:    string[];
}

/** All fixtures for a single round of one league */
export interface RoundFixtures {
  leagueSlug: string;
  round:      number;
  fixtures:   Fixture[];
}

/** Per-league index: maps ISO date string → round numbers active on that date */
export type LeagueDateIndex = Record<string, number[]>;

/** Per-league season state embedded in SaveMeta */
export interface LeagueSeasonState {
  leagueSlug:   string;
  leagueName:   string;
  year:         number;
  start:        string;
  end:          string;
  totalRounds:  number;
  currentRound: number;  // last completed round (0 = none played yet)
  restDays?:    string[];
}

/** Result of generating a league calendar */
export interface LeagueCalendarResult {
  meta:      LeagueSeasonMeta;
  rounds:    RoundFixtures[];
  dateIndex: LeagueDateIndex;
}
