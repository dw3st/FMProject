import type { RosterPlayer } from "@/types/playerTypes";

/**
 * Scouting department (`.claude/rules/game/scouting.md`). Human manager only: the AI never stores
 * nor reads any of this. Saved in `saves/{id}/scouting.json`.
 */

export type ScoutTargetKind = "country" | "league" | "continent" | "player" | "youth";

export interface ScoutTarget {
  kind: ScoutTargetKind;
  /** country / youth: the country name as in `leagueData` ("England"). */
  country?: string;
  /** league: league slug. */
  league?: string;
  /** continent: "Europe", "South America", ... (`countries.json`). */
  continent?: string;
  /** player: the observed player and the club he was at when the mission started. */
  playerId?: string;
  playerName?: string;
  squadId?: string;
}

type ScoutFocusLine = "GK" | "Defender" | "Midfielder" | "Forward";

/** Optional focus of a region mission. */
export interface ScoutFocus {
  line?: ScoutFocusLine;
  maxAge?: number;
  /** Only players who would improve the squad (seen overall >= own line average − 0.3). */
  improves?: boolean;
}

export interface ScoutAssignment {
  id: string;
  /** "chief" (the chief scout) or the id of a field scout. */
  scoutId: string;
  target: ScoutTarget;
  focus?: ScoutFocus;
  /** Day the mission was created. */
  start: string;
  /** Weeks planned (player missions: up to 3). */
  weeks: number;
  /** Mondays already worked. */
  weeksDone: number;
  /** Players observed so far. */
  observed: number;
}

/** What the manager knows of a player, 0..100, and the day of the last observation. */
export interface KnowledgeEntry {
  k: number;
  seen: string;
}

/** Shortlist status snapshot, compared every Monday to raise alerts. */
export interface ShortlistStatus {
  squadId: string;
  forSale: boolean;
  loanListed: boolean;
  contractEnding: boolean;
  free: boolean;
}

export interface ShortlistEntry {
  playerId: string;
  name: string;
  squadId: string;
  addedOn: string;
  note?: string;
  /** Last status seen (absent until the first Monday). */
  status?: ShortlistStatus;
}

export type ShortlistReason = "for_sale" | "loan_listed" | "contract_ending" | "free" | "transferred" | "retired";

export type ScoutGrade = "A" | "B" | "C" | "D" | "E";

export type ScoutReportText = "ready" | "future" | "squad" | "no_upgrade";

export interface ScoutReport {
  id: string;
  date: string;
  missionId?: string;
  playerId: string;
  name: string;
  squadId: string;
  club: string;
  league: string;
  country: string;
  nationality: string;
  age: number;
  position: string;
  /** Knowledge when the report was written. */
  k: number;
  overall: [number, number];
  potential: [number, number];
  /** Market value range, millions of €. */
  value: [number, number];
  /** Estimated weekly wage asked (at the human club's wage factor). */
  wageDemand: number;
  contractUntil?: string;
  forSale: boolean;
  grade: ScoutGrade;
  gem: boolean;
  text: ScoutReportText;
  /** Set when the report is about a club-less prospect (`ScoutProspect`). */
  prospectId?: string;
}

/** A club-less youth from a `youth` mission, signable straight into the academy. */
export interface ScoutProspect {
  player: RosterPlayer;
  country: string;
  expires: string;
  reportId: string;
  /** Training compensation (€) charged when signed. */
  fee: number;
}

export interface ScoutingState {
  missions: ScoutAssignment[];
  knowledge: Record<string, KnowledgeEntry>;
  shortlist: ShortlistEntry[];
  reports: ScoutReport[];
  prospects: ScoutProspect[];
  /** Last monthly recommendation (`YYYY-MM`) and its players, so the next one does not repeat them. */
  lastRecommendation?: { month: string; playerIds: string[] };
}

export function emptyScoutingState(): ScoutingState {
  return { missions: [], knowledge: {}, shortlist: [], reports: [], prospects: [] };
}

/** Screen-only view of how well the manager knows a player (set on API responses, never stored). */
export interface ScoutView {
  knowledge: number;
  /** ± points of uncertainty on every attribute. */
  noise: number;
  /** Last observation day (absent: never observed, only the implicit knowledge). */
  seen?: string;
}
