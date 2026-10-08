import { DP_CATEGORIES, type DPCategory } from "@/GameEngine/PlayerDevelopment";

export const STAFF_ROLES = ["assistant", "fitness", "goalkeeping", "coach", "medic", "analyst", "scout", "fieldScout", "groundskeeper"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** Training areas: one per DP category. */
export const TRAINING_AREAS = DP_CATEGORIES;
export type TrainingArea = DPCategory;
/** The five field areas led by area coaches (Goleiros and Físico have their own coach). */
export const COACH_AREAS = ["defending", "shooting", "technical", "passing", "setPieces"] as const satisfies readonly TrainingArea[];
export type CoachArea = (typeof COACH_AREAS)[number];

export const SPECIALTIES = [...DP_CATEGORIES, "general", "medical", "analysis", "scouting", "pitch"] as const;
export type Specialty = (typeof SPECIALTIES)[number];

/** Specialty of every role but `coach` (who has knowledge in the five coach areas). */
export const ROLE_SPECIALTY: Record<Exclude<StaffRole, "coach">, Specialty> = {
  assistant: "general", fitness: "physical", goalkeeping: "goalkeeping", medic: "medical",
  analyst: "analysis", scout: "scouting", fieldScout: "scouting", groundskeeper: "pitch",
};

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
  /** Renewal step (`staffContracts.ts`): decided once per contract. */
  decision?: "renew" | "leave" | "warned";
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

export function isStaffRole(v: unknown): v is StaffRole {
  return typeof v === "string" && (STAFF_ROLES as readonly string[]).includes(v);
}
export function isCoachArea(v: unknown): v is CoachArea {
  return typeof v === "string" && (COACH_AREAS as readonly string[]).includes(v);
}
