/** The end-of-season report of the manager's club (`.claude/rules/game/season-summary.md`). */

/** How far the club went in a knockout competition that season. */
export type SeasonRunStage =
  | "champion" | "runner_up" | "final" | "sf" | "qf" | "r16" | "r32" | "r64" | "r128" | "preliminary" | "group";

export interface SeasonRun {
  /** Competition slug (`cup_<country>`, `ucl`…). */
  competition: string;
  stage: SeasonRunStage;
}

export type SeasonHighlightKind = "scorer" | "assists" | "rating" | "apps";

export interface SeasonHighlight {
  kind: SeasonHighlightKind;
  playerId: string;
  name: string;
  nationality?: string;
  /** Goals, assists, games, or the average rating. */
  value: number;
}

export interface SeasonDeal {
  name: string;
  fee: number;
}

export interface SeasonSummary {
  year: number;
  /** Season label ("2026-27" / "2027"). */
  season: string;
  clubId: string;
  clubName: string;
  clubColors?: [string, string];
  /** The league the club played that season. */
  league: string;
  table: {
    position: number | null;
    teams: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    gf: number;
    ga: number;
    points: number;
  } | null;
  /** The board's objective of that season; absent when the seat has no record of it. */
  objective?: { target: number; met: boolean };
  /** "league:<slug>" | "cup:<slug>" | "continental:<slug>" won that season. */
  titles: string[];
  move?: "promoted" | "relegated";
  cup?: SeasonRun;
  continental?: SeasonRun;
  crowd?: { average: number; games: number; best: number };
  money: {
    income: number;
    expenses: number;
    net: number;
    prizes: number;
    gate: number;
    wages: number;
  };
  market: {
    signings: number;
    spent: number;
    sales: number;
    received: number;
    biggestBuy?: SeasonDeal;
    biggestSale?: SeasonDeal;
  };
  highlights: SeasonHighlight[];
}

/** What the seat keeps of the season its club has just closed (written at the rollover). */
export interface SeatLastSeason {
  year: number;
  clubId: string;
  target: number;
  met: boolean;
}
