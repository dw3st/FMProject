/** Kind of achievement that scores manager-ranking points (`.claude/rules/game/managers.md`). */
export type ManagerTitleKind = "league" | "cup" | "continental" | "promotion";

export interface ManagerTitle {
  /** Season label ("2026-27" or "2027"), as in history rows. */
  season: string;
  kind: ManagerTitleKind;
  /** Competition slug: the league won (or the league the club was promoted from), cup or continental. */
  competition: string;
  /** Club the manager was in charge of. */
  squadId: string;
  points: number;
}

export interface ManagerRecord {
  id: string;
  name: string;
  squadId: string;
  isPlayer: boolean;
  points: number;
  /** Seasons completed (country rollovers of the manager's club). */
  seasons: number;
  /** Season label of the last rollover counted in `seasons` (keeps a retried day from counting twice). */
  lastSeason?: string;
  titles: ManagerTitle[];
}

/** Cached country weight (`meta.managerWeights[country]`): computed once per country per season. */
export interface CountryWeight {
  season: string;
  weight: number;
}
