import { DP_CATEGORIES, type DPCategory } from "@/GameEngine/PlayerDevelopment";
import type { CoachArea, Specialty, StaffRole, TrainingArea } from "@/types/staffTypes";

export type {
  CoachArea, Specialty, StaffAttributes, StaffContract, StaffMember, StaffRecord, StaffRole, TrainingArea,
} from "@/types/staffTypes";

export const STAFF_ROLES = ["assistant", "fitness", "goalkeeping", "coach", "medic", "analyst", "scout", "fieldScout", "groundskeeper"] as const satisfies readonly StaffRole[];

/** Training areas: one per DP category. */
export const TRAINING_AREAS = DP_CATEGORIES;
/** The five field areas led by area coaches (Goleiros and Físico have their own coach). */
export const COACH_AREAS = ["defending", "shooting", "technical", "passing", "setPieces"] as const satisfies readonly CoachArea[];

export const SPECIALTIES = [...DP_CATEGORIES, "general", "medical", "analysis", "scouting", "pitch"] as const satisfies readonly Specialty[];

// The plain types in `@/types/staffTypes` must match the constant lists exactly.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _sync: [
  Same<(typeof STAFF_ROLES)[number], StaffRole>,
  Same<DPCategory, TrainingArea>,
  Same<(typeof COACH_AREAS)[number], CoachArea>,
  Same<(typeof SPECIALTIES)[number], Specialty>,
] = [true, true, true, true];
void _sync;

/** Specialty of every role but `coach` (who has knowledge in the five coach areas). */
export const ROLE_SPECIALTY: Record<Exclude<StaffRole, "coach">, Specialty> = {
  assistant: "general", fitness: "physical", goalkeeping: "goalkeeping", medic: "medical",
  analyst: "analysis", scout: "scouting", fieldScout: "scouting", groundskeeper: "pitch",
};

export function isStaffRole(v: unknown): v is StaffRole {
  return typeof v === "string" && (STAFF_ROLES as readonly string[]).includes(v);
}
export function isCoachArea(v: unknown): v is CoachArea {
  return typeof v === "string" && (COACH_AREAS as readonly string[]).includes(v);
}
