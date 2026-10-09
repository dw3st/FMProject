/** Referees (`.claude/rules/game/referees.md`, spec `docs/superpowers/specs/2026-10-09-referees-design.md`). */

export type RefereeRole = "referee" | "assistant";
export type RefereeBand = "lenient" | "balanced" | "strict";

/** A referee or assistant of a country's pool (`saves/{id}/referees/pool.json`). */
export interface Referee {
  /** "ref_Q12345" (real, Wikidata) | "ref_g_<country>_<year>_<n>" (generated). */
  id: string;
  name: string;
  /** Game country (`countries.json` key). */
  country: string;
  birthDate: string;
  role: RefereeRole;
  gender: "male" | "female";
  /** 0..100: decides the appointments only (big matches, continental). */
  quality: number;
  /** −1..1, fixed for the career; real (Transfermarkt) or drawn from the id. */
  strictness: number;
  fifa: boolean;
  generated?: true;
  /** True when the rigor comes from the referee's real card record. */
  realStrictness?: true;
  /** Date the referee entered the pool. */
  since: string;
}

export interface RefereePool {
  referees: Referee[];
  /** Country → date of the last renewal. */
  renewed: Record<string, string>;
}

export interface RefereeAssignment {
  refereeId: string;
  assistantIds: [string, string];
}

export interface RefereeCompStats { matches: number; fouls: number; yellows: number; reds: number; penalties: number }

export interface RefereeSeasonStats extends RefereeCompStats {
  byCompetition: Record<string, RefereeCompStats>;
}

export interface RefereeState {
  /** Date → fixtureId → appointment (today and tomorrow only). */
  assignments: Record<string, Record<string, RefereeAssignment>>;
  /** Referee/assistant id → last date worked. */
  lastWorked: Record<string, string>;
  /** Club → last referees (most recent first). */
  recentByClub: Record<string, string[]>;
  /** Referee id → current season. */
  stats: Record<string, RefereeSeasonStats>;
  /** Date → fixtureIds already counted in `stats` (a replayed day never counts twice). */
  counted: Record<string, string[]>;
}

/** Archived season of one country (`saves/{id}/referees/seasons/<country>-<season>.json`). */
export interface RefereeSeasonArchive {
  country: string;
  season: string;
  stats: Record<string, RefereeSeasonStats>;
  /** Snapshot of who they were (a retired referee leaves the pool). */
  referees: Record<string, { name: string; country: string; strictness: number; fifa: boolean; gender: "male" | "female"; birthDate: string }>;
}

/** The referee of a match as the day log and the screens see him (the rigor never goes to the log). */
export interface MatchReferee { id: string; name: string; country: string }

/** The referee the engine reads (`GameState.referee`). */
export interface EngineReferee extends MatchReferee { strictness: number }
