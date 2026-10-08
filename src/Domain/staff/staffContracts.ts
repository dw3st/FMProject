import { addYearsIso } from "@/Domain/contracts/contracts";
import { daysBetween } from "@/Domain/dates";
import { memberStars, staffWageFor } from "@/Domain/staff/staff";
import { STAFF } from "@/Domain/staff/staffConfig";
import type { StaffContract, StaffMember, StaffRecord } from "@/Domain/staff/staffTypes";

/** Coaching-staff contracts (`.claude/rules/game/staff.md`): severance, renewal, the daily step. Pure. */

const C = STAFF.CONTRACT;

export function remainingWeeks(m: StaffMember, date: string): number {
  if (!m.contract) return 0;
  const days = daysBetween(date, m.contract.until);
  return days <= 0 ? 0 : Math.ceil(days / 7);
}

/** Firing: half of what is left on the contract. */
export function severanceOf(m: StaffMember, date: string): number {
  return Math.round(C.SEVERANCE_SHARE * (m.contract?.wage ?? 0) * remainingWeeks(m, date));
}

/** `years` more from the current end, the total at most MAX_YEARS seasons from this season's end; null = too long. */
export function renewedContract(
  m: StaffMember,
  a: { date: string; seasonEnd: string; years: number; clubFactor: number },
): StaffContract | null {
  if (!m.contract || !Number.isInteger(a.years) || a.years < C.MIN_YEARS || a.years > C.MAX_YEARS) return null;
  const until = addYearsIso(m.contract.until, a.years);
  const base = a.date > a.seasonEnd ? addYearsIso(a.seasonEnd, 1) : a.seasonEnd;
  if (until > addYearsIso(base, C.MAX_YEARS - 1)) return null;
  const wage = Math.max(m.contract.wage, staffWageFor(m.role, memberStars(m), a.clubFactor));
  return { until, wage, signed: a.date };
}

/** The director keeps whoever is near the tier's level and not too old. */
export function directorRenews(m: StaffMember, impliedStars: number): boolean {
  return memberStars(m) >= impliedStars - C.DIRECTOR_STAR_MARGIN && m.age < C.DIRECTOR_MAX_AGE;
}

export interface StaffContractNews {
  kind: "staff_expiring" | "staff_renewed" | "staff_leaving" | "staff_left" | "staff_retired";
  member: { id: string; name: string; role: StaffMember["role"] };
  until?: string;
}

/**
 * One day of the human club's staff contracts: whoever is past the end leaves (any day); on Monday,
 * contracts within RENEW_WINDOW_DAYS get one decision (director renews or lets go; the manager gets a warning).
 */
export function staffContractDay(a: {
  staff: StaffRecord; date: string; monday: boolean; seasonEnd: string;
  directorHandles: boolean; impliedStars: number; clubFactor: number;
}): { staff: StaffRecord; left: StaffMember[]; news: StaffContractNews[] } {
  const news: StaffContractNews[] = [];
  const left: StaffMember[] = [];
  const kept: StaffMember[] = [];
  const tag = (m: StaffMember) => ({ id: m.id, name: m.name, role: m.role });
  for (const m of a.staff.members) {
    const c = m.contract;
    if (c && a.date > c.until) {
      left.push(m);
      news.push({ kind: "staff_left", member: tag(m) });
      continue;
    }
    // A manager's warning does not lock the contract: once the director is in charge he decides it.
    const decided = c?.decision === "leave" || (c?.decision === "warned" && !a.directorHandles);
    if (!c || !a.monday || decided || daysBetween(a.date, c.until) > C.RENEW_WINDOW_DAYS) {
      kept.push(m);
      continue;
    }
    if (!a.directorHandles) {
      kept.push({ ...m, contract: { ...c, decision: "warned" } });
      news.push({ kind: "staff_expiring", member: tag(m), until: c.until });
      continue;
    }
    const next = directorRenews(m, a.impliedStars)
      ? renewedContract(m, { date: a.date, seasonEnd: a.seasonEnd, years: C.DIRECTOR_YEARS, clubFactor: a.clubFactor })
      : null;
    if (next) {
      kept.push({ ...m, contract: next });
      news.push({ kind: "staff_renewed", member: tag(m), until: next.until });
    } else {
      kept.push({ ...m, contract: { ...c, decision: "leave" as const } });
      news.push({ kind: "staff_leaving", member: tag(m), until: c.until });
    }
  }
  if (news.length === 0) return { staff: a.staff, left, news };
  return { staff: withMembers(a.staff, kept), left, news };
}

/** `staff` with only `members`, dropping the manual area assignments of whoever left. */
function withMembers(staff: StaffRecord, members: StaffMember[]): StaffRecord {
  const ids = new Set(members.map((m) => m.id));
  const areaAssignments = staff.areaAssignments
    ? Object.fromEntries(Object.entries(staff.areaAssignments).filter(([, id]) => ids.has(id!)))
    : undefined;
  return { members, ...(areaAssignments ? { areaAssignments } : {}) };
}

/**
 * The human club's country rolled: every professional is a year older and whoever reaches the free
 * pool's retirement age (`STAFF.POOL.RETIRE_AGE`) retires (no severance; not back to the pool).
 */
export function ageStaff(staff: StaffRecord): { staff: StaffRecord; retired: StaffMember[]; news: StaffContractNews[] } {
  const aged = staff.members.map((m) => ({ ...m, age: m.age + 1 }));
  const retired = aged.filter((m) => m.age >= STAFF.POOL.RETIRE_AGE);
  const kept = aged.filter((m) => m.age < STAFF.POOL.RETIRE_AGE);
  return {
    staff: withMembers(staff, kept),
    retired,
    news: retired.map((m) => ({ kind: "staff_retired" as const, member: { id: m.id, name: m.name, role: m.role } })),
  };
}
