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
  kind: "staff_expiring" | "staff_renewed" | "staff_leaving" | "staff_left";
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
    if (!c || !a.monday || c.decision || daysBetween(a.date, c.until) > C.RENEW_WINDOW_DAYS) {
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
      kept.push({ ...m, contract: { ...c, decision: "leave" } });
      news.push({ kind: "staff_leaving", member: tag(m), until: c.until });
    }
  }
  if (news.length === 0) return { staff: a.staff, left, news };
  const ids = new Set(kept.map((m) => m.id));
  const areaAssignments = a.staff.areaAssignments
    ? Object.fromEntries(Object.entries(a.staff.areaAssignments).filter(([, id]) => ids.has(id!)))
    : undefined;
  return { staff: { members: kept, ...(areaAssignments ? { areaAssignments } : {}) }, left, news };
}
