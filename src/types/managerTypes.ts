import type { ManagerAward } from "@/types/awardTypes";

/** Kind of achievement that scores manager-ranking points (`.claude/rules/game/managers.md`). */
type ManagerTitleKind = "league" | "cup" | "continental" | "promotion" | "national";

export interface ManagerTitle {
  /** Season label ("2026-27" or "2027"), as in history rows. */
  season: string;
  kind: ManagerTitleKind;
  /** Competition slug: the league won (or the league the club was promoted from), cup or continental. */
  competition: string;
  /** Club the manager was in charge of. */
  squadId: string;
  points: number;
  /** Date the title was credited (world manager of the year, `.claude/rules/game/awards.md`). */
  on?: string;
}

/** Why a manager left a club (Etapa 25); `left_world`: a human manager left the world of friends (part 2). */
export type ManagerLeftReason = "sacked" | "moved" | "contract" | "interim" | "left_world";

/** One spell of a manager at a club. `to` is absent for the current club. */
export interface ManagerPassage {
  squadId: string;
  from: string;
  to?: string;
  left?: ManagerLeftReason;
}

export interface ManagerRecord {
  id: string;
  name: string;
  squadId: string;
  /** The seat of a human manager (`.claude/rules/game/multiplayer.md`); his id is `seat:<seatId>`. Absent = AI. */
  seatId?: string;
  points: number;
  /** Seasons completed (country rollovers of the manager's club). */
  seasons: number;
  /** Season label of the last rollover counted in `seasons` (keeps a retried day from counting twice). */
  lastSeason?: string;
  titles: ManagerTitle[];
  /**
   * Passages through clubs, oldest first (`.claude/rules/game/managers.md`): every manager since
   * Etapa 25. `squadId` is "" while he has no club.
   */
  clubs?: ManagerPassage[];
  /**
   * The human manager's spells at national teams (Etapa 41b), oldest first; the open one (no `to`) is the team he
   * coaches now. Kept apart from `clubs` so "one manager per club" stays a rule on `squadId`.
   */
  national?: ManagerPassage[];
  /** Without a club since this date (the free pool). */
  freeSince?: string;
  /** Interim manager waiting for the club's hire. */
  interim?: true;
  /** Date of the current hiring (protects against an immediate sacking). */
  hiredOn?: string;
  /** Final position percentile of his last completed season (1 = champion). */
  lastFinish?: number;
  /** Free for too long: out of the pool and of the ranking tab (kept in the file). */
  retired?: true;
  /** Objective target of the current club for a season (cached for the Monday review). */
  target?: { season: string; target: number };
  /** Best manager of a league season / of the world (`.claude/rules/game/awards.md`). */
  awards?: ManagerAward[];
}

/** Cached country weight (`meta.managerWeights[country]`): computed once per country per season. */
export interface CountryWeight {
  season: string;
  weight: number;
}
