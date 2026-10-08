import type { StaffEffects } from "@/Domain/staff/staff";
import type { StaffPoolItem } from "@/Domain/staff/staffPool";
import type { CoachArea, StaffMember, StaffRole, TrainingArea } from "@/Domain/staff/staffTypes";

/** A member of the club's staff as `GET /api/saves/:id/staff` sends it (`staffView`, `src/backend/staffRoutes.ts`). */
export interface StaffMemberView extends StaffMember {
  stars: number;
  /** Area coaches: stars in each of the five field areas. */
  starsByArea?: Partial<Record<CoachArea, number>>;
  /** Severance of firing him today. */
  severance?: number;
  /** Years (1..3) the renewal route accepts today, and the wage of a renewal. */
  renewYears?: number[];
  renewWage?: number;
  /** Scouts: the country they know best (`scouting.md` → "Conhecimento por país"). */
  strongCountry?: { country: string; k: number };
}

export interface StaffAreaView {
  area: TrainingArea;
  /** null = nobody leads it (×0,4). */
  stars: number | null;
  mult: number;
  memberId?: string;
}

export interface StaffData {
  members: StaffMemberView[];
  areas: StaffAreaView[];
  areaAssignments: Partial<Record<CoachArea, string>>;
  limits: Record<StaffRole, { used: number; max: number }>;
  effects: StaffEffects;
  weeklyTotal: number;
}

export interface StaffPoolPage {
  total: number;
  items: StaffPoolItem[];
}

/** Display order of the roles and their groups on the staff screen (spec §7). */
export const STAFF_GROUPS: { key: "command" | "training" | "health" | "scouting" | "structure"; roles: StaffRole[] }[] = [
  { key: "command", roles: ["assistant"] },
  { key: "training", roles: ["fitness", "goalkeeping", "coach"] },
  { key: "health", roles: ["medic", "analyst"] },
  { key: "scouting", roles: ["scout", "fieldScout"] },
  { key: "structure", roles: ["groundskeeper"] },
];

/** JSON call to the staff routes; `error` is the route's error code (`roleFull`, `noClub`, ...). */
export async function staffCall<T>(url: string, method: "GET" | "POST" | "PUT" = "GET", body?: unknown): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method,
      ...(body !== undefined ? { headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok || !json) return { ok: false, error: json?.error ?? "generic" };
    return { ok: true, data: json };
  } catch {
    return { ok: false, error: "generic" };
  }
}

/** `×1,06` in the user's language. */
export function formatMult(n: number, lang: string): string {
  return `×${n.toLocaleString(lang, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** `12/2028`: month and year of a contract end. */
export function contractEnd(until: string): string {
  return `${until.slice(5, 7)}/${until.slice(0, 4)}`;
}
