import type { AttributeId } from "@/GameInterface/AttributeLabels";

export interface PlayerStatsRecord {
  passing: number;
  vision: number;
  finishing: number;
  dribbling: number;
  speed: number;
  acceleration: number;
  tackling: number;
  pressing: number;
  stamina: number;
  heading: number;
  strength: number;
  reflex: number;
  jump: number;
}

export interface PlayerProfile {
  summary: string;
  archetype: string;
}

export interface PlayerSeasonLog {
  appearances: number;
  goals:       number;
  assists:     number;
  shots:       number;
  passesCompleted: number;
  passesAttempted: number;
  tackles:     number;
  interceptions: number;
  avgRating:   number;
  /** Last 5 match ratings (0–10), newest last. */
  recentRatings: number[];
  trainingSessions: number;
  fitness:     number;
  morale:      number;
}

export function emptySeasonLog(): PlayerSeasonLog {
  return {
    appearances: 0, goals: 0, assists: 0, shots: 0,
    passesCompleted: 0, passesAttempted: 0, tackles: 0, interceptions: 0,
    avgRating: 0, recentRatings: [], trainingSessions: 0, fitness: 75, morale: 70,
  };
}

/** Development points accumulated per attribute. Persisted on the player. */
export interface DevelopmentProgress {
  passing:      number;
  vision:       number;
  finishing:    number;
  dribbling:    number;
  speed:        number;
  acceleration: number;
  tackling:     number;
  pressing:     number;
  stamina:      number;
  heading:      number;
  strength:     number;
  reflex:       number;
  jump:         number;
}

export function emptyDevelopmentProgress(): DevelopmentProgress {
  return {
    passing: 0, vision: 0, finishing: 0, dribbling: 0,
    speed: 0, acceleration: 0, tackling: 0, pressing: 0,
    stamina: 0, heading: 0, strength: 0,
    reflex: 0, jump: 0,
  };
}

export interface RosterPlayer {
  id: string;
  name: string;
  age: number;
  squadId: string;
  preferredFoot: "left" | "right";
  positions: string[];
  stats: PlayerStatsRecord;
  profile: PlayerProfile;
  seasonLog?: PlayerSeasonLog;
  progress?: DevelopmentProgress;
  /** When set (e.g. from data pipeline), used for scout / UI. */
  nationality?: string | null;
  /** Cached best weighted score across all specific roles in the player's main role.
   *  Recomputed when stats change (see PlayerDevelopment.applyDevelopment). */
  overallAvg?: number;
}

export interface ClubFinances {
  broadcasting: number;
  commercial: number;
  total: number;
  budget: number;
  followers: number;
}

/** AI club financial tier (`src/Domain/aiFinance`). Never set on the human club. */
export type FinancialTier = "LOW" | "MEDIUM" | "HIGH" | "ELITE";

export interface ClubVenue {
  name: string;
  city: string;
  capacity: number;
  surface?: string;
}

export interface ClubCoach {
  id: number;
  name: string;
  firstname?: string | null;
  lastname?: string | null;
  age?: number | null;
  nationality?: string | null;
  points?: number;
}

export interface Squad {
  id: string;
  name: string;
  colors: [string, string];
  money: number;
  players: RosterPlayer[];
  /** Filesystem / URL segment (e.g. atletico_mineiro); may differ from `id` (e.g. squad__001). */
  slug?: string;
  /** Set when listing squads from save paths (…/squads/{leagueSlug}/…). */
  leagueSlug?: string;
  /**
   * Bumped by every `SaveService.moveSquad`. If a move's delete of the old file
   * fails, both copies exist; the squad index keeps the one with the higher rev.
   */
  membershipRev?: number;
  /** Club country from squad data; used as nationality fallback in scout. */
  country?: string;
  finances?: ClubFinances;
  /**
   * AI clubs only: financial tier, written at each season rollover (performance + promotion /
   * relegation). Until the club's first rollover it is absent and the tier is derived from income
   * (`financialTierOf`).
   */
  financialTier?: FinancialTier;
  /**
   * AI clubs only: transfer money left this season (€). Granted from tier + popularity at each
   * rollover, reduced by fees, partly refilled by sales. Absent = the full seasonal grant
   * (`aiTransferBudgetOf`). AI clubs never use `finances.budget`; the human club only uses that.
   */
  aiTransferBudget?: number;
  venue?: ClubVenue;
  /** Head coach from data pipeline; use `id` for identity when present. */
  coach?: ClubCoach;
}

export interface LeagueTeam {
  squadId: string;
  name: string;
  colors: [string, string];
  /** Club file slug from leagueData standings; used for routes and logos when `id` is not league_prefixed. */
  slug?: string;
}

export interface StandingRow extends LeagueTeam {
  mp: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  form: ("W" | "D" | "L")[];
}

export type LeagueZoneColor =
  | "blue"
  | "orange"
  | "cyan"
  | "green"
  | "red"
  | "purple";

export interface LeagueZone {
  id: string;
  label: string;
  color: LeagueZoneColor;
  from?: number;
  to?: number;
  fromEnd?: number;
}

export interface LeagueData {
  slug: string;
  name: string;
  country: string;
  season: string;
  standings: LeagueTeam[];
  zones?: LeagueZone[];
  iso2?: string;
  source?: string;
}

export function isAttributeId(key: string): key is AttributeId {
  return [
    "passing", "vision", "finishing", "dribbling",
    "speed", "acceleration", "tackling", "pressing",
    "stamina", "heading", "strength",
    "reflex", "jump",
  ].includes(key);
}
