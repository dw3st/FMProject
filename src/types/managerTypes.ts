/** Kind of achievement that scores manager-ranking points (`.claude/rules/game/managers.md`). */
type ManagerTitleKind = "league" | "cup" | "continental" | "promotion";

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
  /**
   * Human manager only: his passages through clubs, oldest first (`.claude/rules/game/jobs.md`).
   * `to` is absent for the current club. `squadId` is "" while he is unemployed.
   */
  clubs?: { squadId: string; from: string; to?: string }[];
}

/** Cached country weight (`meta.managerWeights[country]`): computed once per country per season. */
export interface CountryWeight {
  season: string;
  weight: number;
}
