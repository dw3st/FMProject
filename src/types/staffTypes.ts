/**
 * Coaching-staff data types (`.claude/rules/game/staff.md`). Plain data only: the constant lists and
 * guards live in `@/Domain/staff/staffTypes`, which re-exports these and checks they stay in sync.
 */

export type StaffRole =
  | "assistant" | "fitness" | "goalkeeping" | "coach" | "medic" | "analyst" | "scout" | "fieldScout" | "groundskeeper";

/** Training areas: one per DP category (`DP_CATEGORIES`). */
export type TrainingArea = "goalkeeping" | "defending" | "shooting" | "technical" | "passing" | "physical" | "setPieces";

/** The five field areas led by area coaches (Goleiros and Físico have their own coach). */
export type CoachArea = "defending" | "shooting" | "technical" | "passing" | "setPieces";

export type Specialty = TrainingArea | "general" | "medical" | "analysis" | "scouting" | "pitch";

/** 1..20 each; the stars are derived from them (no effect of their own). */
export interface StaffAttributes {
  determination: number;
  discipline: number;
  adaptability: number;
  playerReading: number;
  knowledge: Partial<Record<Specialty, number>>;
}

export interface StaffContract {
  /** Last day (ISO): the end of a league season. */
  until: string;
  /** Weekly wage (€), frozen at signing. */
  wage: number;
  signed: string;
  /** Renewal step (`staffContracts.ts`): the director let him go, or the manager was warned. */
  decision?: "leave" | "warned";
}

/** What a scout knows of a country (`.claude/rules/game/scouting.md` → "Conhecimento por país"). */
export interface CountryKnowledgeEntry {
  /** 0..100, one decimal, value on `last`. */
  k: number;
  /** Last day a mission worked in this country (ISO). */
  last: string;
}

export interface StaffMember {
  id: string;
  name: string;
  nationality: string;
  role: StaffRole;
  age: number;
  attributes: StaffAttributes;
  /** Absent while in the free pool. */
  contract?: StaffContract;
  /** In the pool since (ISO). */
  since?: string;
}

/** The human club's staff (`Squad.staff`); AI clubs never store it. */
export interface StaffRecord {
  members: StaffMember[];
  /** Coach areas the user assigned by hand (area -> member id); the rest is automatic. */
  areaAssignments?: Partial<Record<CoachArea, string>>;
}
