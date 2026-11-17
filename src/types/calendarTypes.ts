import type { PlayerSeasonLog, StandingRow } from "@/types/playerTypes";
import type { YouthCompMetaData } from "@/types/youthCompTypes";

/** How a knockout fixture was decided after 90 minutes, from the home/away point of view. */
export interface MatchDecider {
  /** Goals scored in extra time only (the fixture `result` already includes them). */
  extraTime: { home: number; away: number };
  penalties?: { home: number; away: number };
}

export interface Fixture {
  id:          string;          // e.g. "fix_0001"
  date:        string;
  competition: string;
  round:       number;
  home:        string;          // squadId
  away:        string;          // squadId
  played:      boolean;
  result:      { home: number; away: number } | null;
  /** Knockout fixture (cup): a draw after 90' goes to extra time and penalties. */
  knockout?:   true;
  /** Neutral venue (cup final): no home advantage. */
  neutral?:    true;
  /** Knockout only: extra-time goals / shootout. Absent when decided in 90'. */
  decider?:    MatchDecider;
  /** Two-legged tie id (same on both legs). */
  tieId?:      string;
  /** 1 = first leg, 2 = second leg (knockout, decides on aggregate). */
  leg?:        1 | 2;
  /** Second leg only: first-leg goals from THIS fixture's home/away point of view. */
  aggregate?:  { home: number; away: number };
  /** Youth competition only: no free day for the game — `played: true`, `result: null`, out of the table. */
  cancelled?:  true;
  /** Youth competition only: original date of a postponed game. */
  postponedFrom?: string;
  /**
   * League only: original date of a game moved because one of its clubs had another official game the same day
   * or the day before/after (`.claude/rules/game/rescheduling.md`). The first original date when moved twice.
   */
  rescheduledFrom?: string;
  /**
   * Player calendar only (`GET /api/saves/:id`, Etapa 41b): a game of the national team the human manager coaches —
   * the team's id here, its side replaced by the club's id so every "my match day" flow reads it.
   */
  nationalTeam?: string;
}

export interface SeasonData {
  year:     number;
  start:    string;
  end:      string;
  calendar: Fixture[];
  /**
   * The club's youth-competition games (under-21 / under-19), kept apart from `calendar`: a youth
   * game is never "the match day" (`.claude/rules/game/youth-competitions.md`).
   */
  youthCalendar?: Fixture[];
  /**
   * ISO dates that are rest days (recovery, no training).
   * Pre-seeded with the day before and after each match date.
   * Players can toggle future non-game days between "training" and "rest".
   */
  restDays?: string[];
  /** The national team the human manager coaches (Etapa 41b): its games are in `calendar` (`Fixture.nationalTeam`). */
  nationalTeamId?: string;
  /** Names of the national teams in `calendar` (by `nat_…` id). */
  teamNames?: Record<string, string>;
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
  /** Intercontinental Cup archive only: the edition's bracket (entrants and matches). */
  intercontinental?: IntercontinentalMetaData;
}

// --- NEW MULTI-LEAGUE TYPES ---

/** Stage keys, by number of entrants: preliminary, r128 … r16, qf, sf, final. */
export type CupStageName = "preliminary" | "r128" | "r64" | "r32" | "r16" | "qf" | "sf" | "final";

/** One knockout stage of a national cup. `round` is the RoundFixtures file number. */
export interface CupStage {
  round:    number;
  name:     CupStageName;
  date:     string;
  /** Clubs in this stage once drawn (empty before the draw). */
  entrants: string[];
  drawn:    boolean;
}

export interface CupMetaData {
  /** leagueData `country`. */
  country:    string;
  stages:     CupStage[];
  /** Clubs that skip the preliminary stage and enter at stage 2 (empty when there is none). */
  byes:       string[];
  /** Club tier (1 = top) at generation time — decides who hosts. */
  tiers:      Record<string, number>;
  championId: string | null;
}

/** UCL/UEL (Europe) or Lib/Sud (South America). */
export type ContinentalSlug = "ucl" | "uel" | "lib" | "sud";
/** `league`/`playoff` only in the league-phase format (Champions League / Europa League since 12.12); `group` only in the group format. */
export type ContinentalStageName = "group" | "league" | "playoff" | "r16" | "qf" | "sf" | "final";

/** One stage of a continental competition. `rounds` are RoundFixtures file numbers. */
export interface ContinentalStage {
  name:   ContinentalStageName;
  /** RoundFixtures file numbers of this stage (group: 6, r16/qf/sf: 2 (leg 1, leg 2), final: 1). */
  rounds: number[];
  dates:  string[];
  drawn:  boolean;
}

export interface ContinentalMetaData {
  competition: ContinentalSlug;
  continent:   "Europe" | "South America";
  /** "league": one table of 36, play-off, fixed bracket (UCL/UEL since 12.12). Absent = "groups" (seasons drawn before). */
  format?:     "league" | "groups";
  /** Group format: A–H, 4 clubs each, pot order (pot 1 first). Empty in the league format. */
  groups:      { name: string; clubs: string[] }[];
  /** League format: 4 pots of 9, pot 1 first. */
  pots?:       string[][];
  /** League format: final league-phase position of every club (1..36), set when the league phase ends. */
  seeds?:      Record<string, number>;
  stages:      ContinentalStage[];
  /** Club → leagueData country, for draw restrictions and display. */
  countryOf:   Record<string, string>;
  /** Club strength (quickSim teamLevel) at generation — pots and "stronger side". */
  level:       Record<string, number>;
  championId:  string | null;
}

/** Confederation of an Intercontinental Cup slot (`.claude/rules/game/intercontinental.md`). */
export type IccConfed = "UEFA" | "CONMEBOL" | "AFC" | "CAF" | "CONCACAF" | "OFC";
/** The five Intercontinental Cup matches: OFC×AFC, then ×CAF (Africa–Asia–Pacific), CONCACAF×Libertadores (Derby of the
 * Americas), the Challenger Cup and the final against the Champions League winner. */
export type IccMatchName = "afc_ofc" | "apac" | "americas" | "challenger" | "final";

/** How a slot was filled: the competition/league champion, the runner-up (next in line), or nobody (bye). */
export interface IccEntrant {
  clubId:  string | null;
  /** League slug (AFC/CAF/CONCACAF/OFC) or continental slug (`ucl`, `lib`) the club came from. */
  source:  string | null;
  /** Final position in that table / competition (1 = champion). Absent for a bye. */
  position?: number;
}

/** One match of the bracket. `round` = its RoundFixtures file (1..5). */
export interface IccMatch {
  n:      1 | 2 | 3 | 4 | 5;
  name:   IccMatchName;
  round:  number;
  date:   string;
  /** Sides once known (null = empty side, i.e. a bye; undefined = not decided yet). */
  home?:  string | null;
  away?:  string | null;
  /** The match is settled: played, or decided by a bye. */
  done:   boolean;
  /** Winner once done (null when both sides were empty). */
  winner: string | null;
  /** Settled without a game (one side or both empty). */
  bye?:   true;
}

export interface IntercontinentalMetaData {
  year:       number;
  entrants:   Record<IccConfed, IccEntrant>;
  matches:    IccMatch[];
  /** Club → leagueData country, for display. */
  countryOf:  Record<string, string>;
  championId: string | null;
  /** Earlier editions archived in `seasons/<year>/icc/` (oldest first). */
  pastYears:  number[];
}

/** Lightweight season metadata for one league (replaces SeasonData as the per-league store) */
export interface LeagueSeasonMeta {
  leagueSlug:   string;
  year:         number;
  start:        string;   // "YYYY-MM-DD"
  end:          string;   // "YYYY-MM-DD"
  totalRounds:  number;
  /** Rest days for the player's league (shown in training calendar UI) */
  restDays?:    string[];
  /** "cup" for a national cup, "continental" for UCL/UEL/Lib/Sud, "youth" for an under-21/under-19; absent for a league. */
  kind?:        "cup" | "continental" | "youth" | "intercontinental";
  cup?:         CupMetaData;
  continental?: ContinentalMetaData;
  /** Intercontinental Cup (`leagues/icc`, one edition a year in December). */
  intercontinental?: IntercontinentalMetaData;
  youth?:       YouthCompMetaData;
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
}

/** Result of generating a league calendar */
export interface LeagueCalendarResult {
  meta:      LeagueSeasonMeta;
  rounds:    RoundFixtures[];
  dateIndex: LeagueDateIndex;
}
