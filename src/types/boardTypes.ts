/**
 * Board and fans of the human club (`.claude/rules/game/board-fans.md`). Stored in
 * `SaveMeta.board`; AI clubs never carry any of this.
 */

export type SeasonObjectiveKind = "title" | "continental" | "top_half" | "mid_table" | "avoid_relegation";

export interface SeasonObjective {
  kind: SeasonObjectiveKind;
  /** Worst final league position that still meets the objective (1-based). */
  target: number;
  leagueSlug: string;
  leagueSize: number;
  /** Season label of the league ("2026-27" / "2027"). */
  season: string;
}

export type ResultLetter = "W" | "D" | "L";

/** Points the board demands over the next league matches before it sacks the manager. */
export interface BoardUltimatum {
  since: string;
  matchesLeft: number;
  pointsNeeded: number;
  points: number;
}

/** The manager's record at the club (official matches), for the sacking screen. */
interface BoardRecord {
  startDate: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** "league:<slug>" | "cup:<slug>" | "continental:<slug>" won at the club. */
  titles: string[];
}

export interface BoardSnapshot {
  date: string;
  board: number;
  fans: number;
}

export interface BoardState {
  /** 0..100 */
  board: number;
  /** 0..100 */
  fans: number;
  objective: SeasonObjective | null;
  /** Daily snapshots, oldest first (trend arrows). */
  history: BoardSnapshot[];
  /** Last official results, oldest first. */
  recent: ResultLetter[];
  ultimatum?: BoardUltimatum;
  /** A warning was sent and the board has not recovered since. */
  warned?: boolean;
  /** Praise was sent and the board has not cooled down since. */
  praised?: boolean;
  record: BoardRecord;
}

export type SackReason = "board" | "ultimatum";

/** Set on `SaveMeta.ended` when the manager is sacked: the career is over. */
export interface CareerEnded {
  date: string;
  reason: SackReason;
  clubName: string;
  leagueName: string;
  /** League position on the day (null when the table has no games yet). */
  position: number | null;
  board: number;
  fans: number;
  record: BoardRecord;
}

export type BoardMessageKind = "objective" | "warning" | "ultimatum" | "ultimatum_met" | "praise" | "bonus" | "sacked";
