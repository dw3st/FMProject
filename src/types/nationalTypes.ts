import type { Fixture } from "@/types/calendarTypes";
import type { Confed } from "@/types/registrationTypes";

/** National teams (`.claude/rules/game/national-teams.md`, Etapa 41a). */

export type NationalTournament = "wc" | "euro" | "copa";
export type NationalCompKind = "qualifier" | "tournament" | "friendlies";
export type NationalStageName = "group" | "r32" | "r16" | "qf" | "sf" | "final";

/** One national team of the save. `nation` is the normalized nationality (`normalizeNation`). */
export interface NationalTeam {
  /** Id used where a squad id is expected (`nat_<key>`), also the AI manager's `squadId`. */
  id: string;
  nation: string;
  confed: Confed;
  /** FIFA SUM points. */
  elo: number;
  /** Ranking position at the start of the previous window (the screen's arrow). */
  prevRank?: number;
  /** Manager record in `managers.json` (an AI coach with `squadId = id`, or `player` from the 41b on). */
  managerId: string;
  /** Official + friendly games played. */
  games: number;
}

export interface NationalCallUpPlayer {
  id: string;
  /** Club of the real player at the call-up ("" for a generated one). */
  squadId: string;
  name: string;
  /** Generated player (`ngen_…`): only exists in this national team. */
  generated?: true;
}

/** Players on duty with a national team between `from` and `until` (both inclusive). */
export interface NationalCallUp {
  nation: string;
  from: string;
  until: string;
  /** Tournament slug when it is a tournament call-up. */
  competition?: string;
  players: NationalCallUpPlayer[];
  /** Per real player: games and goals in this call-up (the "returned" message). */
  tally?: Record<string, { apps: number; goals: number }>;
}

export interface NationalVacancy {
  since: string;
  hireOn: string;
}

export interface NationalState {
  /** By team id (`nat_<key>`). */
  teams: Record<string, NationalTeam>;
  /** Active call-ups by team id. */
  callUps: Record<string, NationalCallUp>;
  /** The latest call-up of each team (the screen shows it between windows). */
  lastCallUps?: Record<string, NationalCallUp>;
  /** Every competition slug of the save, oldest first. */
  competitions: string[];
  /** Draws already made (`euroq_2028`, `wc_2030`, …). */
  draws: string[];
  /** National teams waiting to hire a manager. */
  vacancies: Record<string, NationalVacancy>;
  /** Caps and goals of the generated players (`ngen_…`), who have no club to keep them. */
  localCaps?: Record<string, [number, number]>;
  /** Last window / tournament start whose call-ups were made (idempotent per day). */
  lastCallUpDate?: string;
}

export interface NationalStage {
  name: NationalStageName;
  dates: string[];
  drawn: boolean;
}

export interface NationalGroup {
  name: string;
  teams: string[];
}

export interface NationalLeader {
  name: string;
  nation: string;
  squadId: string;
  apps: number;
  goals: number;
  assists: number;
  ratingSum: number;
  /** Main line (GK/DEF/MID/FWD) for the goalkeeper award. */
  line: "GK" | "DEF" | "MID" | "FWD";
  generated?: true;
}

export interface NationalAwardedPlayer {
  playerId: string;
  name: string;
  nation: string;
  squadId: string;
  value: number;
  slot?: string;
}

export interface NationalTournamentAwards {
  competition: string;
  year: number;
  bestPlayer?: NationalAwardedPlayer;
  topScorer?: NationalAwardedPlayer;
  bestGoalkeeper?: NationalAwardedPlayer;
  team: NationalAwardedPlayer[];
  /** Shortlist for the world player of the year (score = rating + goals/assists + champion). */
  shortlist: (NationalAwardedPlayer & { score: number })[];
  weight: number;
}

export interface NationalCompetition {
  slug: string;
  kind: NationalCompKind;
  tournament?: NationalTournament;
  /** Year of the tournament (qualifiers: of the tournament they qualify for; friendlies: calendar year). */
  year: number;
  confed?: Confed;
  teams: string[];
  groups: NationalGroup[];
  stages: NationalStage[];
  fixtures: Fixture[];
  /** Qualifiers: places to fill. */
  slots?: number;
  /** Qualifiers: who qualified (set when the group stage ends). */
  qualified?: string[];
  championId?: string | null;
  status: "scheduled" | "running" | "finished";
  leaders: Record<string, NationalLeader>;
  awards?: NationalTournamentAwards;
}

/** Season log of national games (outside the season totals, like `youthCup`). */
export interface NationalSeasonLog {
  appearances: number;
  goals: number;
  assists: number;
  ratingSum: number;
}

/** Permanent national career of a player (caps, goals, titles, tournament awards). */
export interface NationalCareer {
  nation: string;
  caps: number;
  goals: number;
  assists: number;
  /** Tournament slugs won. */
  titles: string[];
  /** Tournament awards: `<kind>:<slug>` (best_player, top_scorer, best_goalkeeper, team). */
  awards?: string[];
}

export interface NationalDuty {
  nation: string;
  from: string;
  until: string;
}
