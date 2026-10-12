/**
 * Club history and records (`.claude/rules/game/club-history.md`). One file per club in the save
 * (`saves/{id}/clubHistory/{squadId}.json`), written at the club's country rollover and at fee
 * transfers. Only what happened since the career began — the source data has no real titles.
 */

/** One finished league season of the club. */
export interface ClubSeasonRow {
  /** League season label ("2026-27" / "2027"), as in player history rows. */
  season: string;
  league: string;
  /** Pyramid tier of the league that season (1 = top). */
  tier: number;
  /** Final position, null when the table had no games. */
  position: number | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
  /** "league:<slug>" | "cup:<slug>" | "continental:<slug>" | "promotion:<league left>". */
  titles: string[];
  /** Promotion / relegation at the end of this season. */
  move?: "promoted" | "relegated";
  topScorer?: { playerId: string; name: string; goals: number };
  /** Manager in charge at the rollover. */
  manager?: string;
}

/** A player's totals at the club (sum of every history row at it). */
export interface ClubScorer {
  name: string;
  goals: number;
  apps: number;
  assists: number;
  /** Titles won at the club (league, cup, continental) — from his season rows. */
  titles?: number;
  /** Season awards won while at the club. */
  awards?: number;
}

export interface ClubMatchRecord {
  season: string;
  date: string;
  opponentId: string;
  opponentName: string;
  /** Goals from the club's point of view. */
  gf: number;
  ga: number;
  competition: string;
}

export interface ClubTransferRecord {
  playerId: string;
  name: string;
  fee: number;
  season: string;
  date: string;
  /** The other club (seller of a signing, buyer of a sale). */
  clubId: string;
  clubName: string;
}

export interface ClubRecords {
  biggestWin?: ClubMatchRecord;
  biggestLoss?: ClubMatchRecord;
  mostGoalsSeason?: { playerId: string; name: string; goals: number; season: string };
  recordSigning?: ClubTransferRecord;
  recordSale?: ClubTransferRecord;
  highestFinish?: { season: string; league: string; tier: number; position: number };
  /** Longest unbeaten league run inside one season. */
  unbeaten?: { matches: number; from: string; to: string; season: string };
}

export type ClubRecordKind = keyof ClubRecords;

export interface ClubHistory {
  squadId: string;
  seasons: ClubSeasonRow[];
  /** playerId → totals at the club. */
  scorers: Record<string, ClubScorer>;
  /**
   * Mid-season departures (partial history rows) of seasons not closed yet: they are already in
   * `scorers`, and the season's top scorer at the rollover also counts them.
   */
  openPartials?: Record<string, Record<string, ClubScorer>>;
  records: ClubRecords;
}

/** A record of the club that was beaten (an earlier value existed), with its new value. */
export type ClubRecordBroken = {
  [K in ClubRecordKind]: { kind: K; value: NonNullable<ClubRecords[K]> };
}[ClubRecordKind];

/** A player in the club's top 10 (`GET /api/saves/:id/clubs/:squadId/history`). */
export interface ClubTopPlayer extends ClubScorer {
  playerId: string;
  /** Still in the club's squad. */
  current: boolean;
  retired: boolean;
}

/** Idol or legend of the club (`clubLegends`, rule in `.claude/rules/game/club-history.md`). */
export interface ClubLegend extends ClubTopPlayer {
  tier: "legend" | "idol";
}

/** Facts derived from the history (`clubFacts`). */
export interface ClubFacts {
  seasons: number;
  /** League, cup and continental titles (promotions apart). */
  titles: number;
  promotions: number;
  relegations: number;
  /** Goals scored in every finished league season. */
  leagueGoals: number;
  bestSeason?: { season: string; league: string; points: number; position: number | null };
  mostTeamGoals?: { season: string; league: string; goals: number };
  topScorer?: { playerId: string; name: string; goals: number };
  mostApps?: { playerId: string; name: string; apps: number };
}

/** `GET /api/saves/:id/clubs/:squadId/history`. */
export interface ClubHistoryResponse {
  squadId: string;
  name: string;
  colors: [string, string];
  leagueSlug: string;
  venue: { name: string; city: string; capacity: number } | null;
  manager: string | null;
  /** Managers of earlier seasons (season rows), other than the current one. */
  pastManagers: string[];
  /** First season of the history (or the current one when there is none yet). */
  since: string | null;
  seasons: ClubSeasonRow[];
  titles: { title: string; seasons: string[] }[];
  topScorers: ClubTopPlayer[];
  topApps: ClubTopPlayer[];
  /** Idols and legends (active, retired or gone), legends first. */
  legends: ClubLegend[];
  facts: ClubFacts;
  records: ClubRecords;
}
