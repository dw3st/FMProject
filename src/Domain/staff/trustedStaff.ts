import { addDays, daysBetween } from "@/Domain/dates";
import { memberStars, roleLimit, signContract, starsFromScore, starsIn, areaScore } from "@/Domain/staff/staff";
import { STAFF } from "@/Domain/staff/staffConfig";
import {
  COACH_AREAS, ROLE_SPECIALTY, type Specialty, type StaffMember, type StaffRecord,
} from "@/Domain/staff/staffTypes";
import { wageFactorOf } from "@/Domain/finance/wages";
import type { Squad } from "@/types/playerTypes";

/**
 * The manager's trusted staff (10.7, `.claude/rules/game/staff.md` → "Comissão de confiança"): up to
 * `MAX` professionals who follow him from club to club, and the courses he pays for them from his
 * own wallet. Pure.
 */
export const TRUSTED = {
  MAX: 3,
  /** Days a course lasts: he is away the whole time (his role counts as vacant), still paid. */
  COURSE_DAYS: 60,
  /** Stars a course adds to his specialty. */
  STAR_GAIN: 0.5,
  /** Days between two courses of the same professional. */
  COURSE_EVERY_DAYS: 365,
  /** Price by the stars he has today: `[up to these stars, EUR]`; 5 stars has no course. */
  PRICES: [[3, 150_000], [3.5, 300_000], [4, 600_000], [4.5, 1_200_000]],
  /** Seasons of the contract he signs at the manager's new club. */
  NEW_CLUB_YEARS: 2,
} as const;

export const trustedOf = (staff: StaffRecord | undefined): StaffMember[] => (staff?.members ?? []).filter((m) => m.trusted);

/** The specialty a course raises: the role's; an area coach's best area. */
export function courseSpecialty(m: StaffMember): Specialty {
  if (m.role !== "coach") return ROLE_SPECIALTY[m.role];
  return [...COACH_AREAS].sort((a, b) => areaScore(m, b) - areaScore(m, a))[0]!;
}

/** Price of his next course; null at five stars. */
export function coursePriceOf(m: StaffMember): number | null {
  const stars = memberStars(m);
  if (stars >= STAFF.MAX_STARS) return null;
  return TRUSTED.PRICES.find(([upTo]) => stars <= upTo)?.[1] ?? TRUSTED.PRICES[TRUSTED.PRICES.length - 1]![1];
}

export type TrustRefusal = "trustedFull";

/** Marks (or unmarks) a professional as trusted; `trustedFull` past the limit. */
export function setTrusted(staff: StaffRecord, memberId: string, trusted: boolean): StaffRecord | TrustRefusal | null {
  const m = staff.members.find((x) => x.id === memberId);
  if (!m) return null;
  if (!!m.trusted === trusted) return staff;
  if (trusted && trustedOf(staff).length >= TRUSTED.MAX) return "trustedFull";
  return {
    ...staff,
    members: staff.members.map((x) => {
      if (x.id !== memberId) return x;
      const { trusted: _t, ...rest } = x;
      return trusted ? { ...rest, trusted: true as const } : rest;
    }),
  };
}

export type CourseRefusal = "notTrusted" | "onCourse" | "courseBusy" | "atBest" | "tooSoon" | "contractEnds" | "onMission" | "noMoney";

/** Why `m` cannot start a course today; null = he can. `leading`: he leads a scouting mission now. */
export function courseRefusal(a: { staff: StaffRecord; member: StaffMember; date: string; wallet: number; leading?: boolean }): CourseRefusal | null {
  const m = a.member;
  if (!m.trusted) return "notTrusted";
  if (m.course) return "onCourse";
  if (a.staff.members.some((x) => x.course)) return "courseBusy";
  const price = coursePriceOf(m);
  if (price === null) return "atBest";
  if (m.lastCourse && daysBetween(m.lastCourse, a.date) < TRUSTED.COURSE_EVERY_DAYS) return "tooSoon";
  if (m.contract && m.contract.until < addDays(a.date, TRUSTED.COURSE_DAYS)) return "contractEnds";
  if (a.leading) return "onMission";
  return price > a.wallet ? "noMoney" : null;
}

/** `m` leaves for the course today. */
export function startStaffCourse(m: StaffMember, date: string): StaffMember {
  return { ...m, course: { started: date, until: addDays(date, TRUSTED.COURSE_DAYS), specialty: courseSpecialty(m) } };
}

/**
 * `m` with his stars in `specialty` raised by `gain`: the knowledge first, then the general
 * attributes one point at a time, until the stars reach the target (or everything is at 20).
 */
export function withStarGain(m: StaffMember, specialty: Specialty, gain: number): StaffMember {
  const target = Math.min(STAFF.MAX_STARS, starsIn(m, specialty) + gain);
  const general = ["playerReading", "determination", "discipline", "adaptability"] as const;
  let cur: StaffMember = { ...m, attributes: { ...m.attributes, knowledge: { ...m.attributes.knowledge } } };
  const reached = () => starsFromScore(areaScore(cur, specialty)) >= target;
  while (!reached() && (cur.attributes.knowledge[specialty] ?? STAFF.ATTR_MIN) < STAFF.ATTR_MAX) {
    cur.attributes.knowledge[specialty] = (cur.attributes.knowledge[specialty] ?? STAFF.ATTR_MIN) + 1;
  }
  for (let guard = 0; !reached() && guard < 80; guard++) {
    const k = general.find((g) => cur.attributes[g] < STAFF.ATTR_MAX);
    if (!k) break;
    cur = { ...cur, attributes: { ...cur.attributes, [k]: cur.attributes[k] + 1 } };
  }
  return cur;
}

/** `m` back from his course: the gain applied, the course gone. */
export function finishCourse(m: StaffMember): StaffMember {
  if (!m.course) return m;
  const { course, ...rest } = m;
  return { ...withStarGain(rest, course.specialty, TRUSTED.STAR_GAIN), lastCourse: course.started };
}

/** Courses that end on or before `date` are finished; `done` lists who came back. */
export function settleCourses(members: StaffMember[], date: string): { members: StaffMember[]; done: StaffMember[] } {
  const done: StaffMember[] = [];
  const next = members.map((m) => {
    if (!m.course || m.course.until > date) return m;
    const back = finishCourse(m);
    done.push(back);
    return back;
  });
  return done.length === 0 ? { members, done } : { members: next, done };
}

/** What the manager takes with him when he leaves a club: his trusted professionals, without their contracts. */
export function leavingTrusted(staff: StaffRecord | undefined): StaffMember[] {
  return trustedOf(staff).map((m) => {
    const { contract: _c, since: _s, ...rest } = m;
    return rest;
  });
}

/**
 * The new club's staff with the manager's trusted professionals in it: each one takes the place of
 * the weakest professional of his role (or an empty place under the role's limit) and signs for
 * `NEW_CLUB_YEARS` seasons at this club's wage. One with no place to take (the role is full of
 * other trusted professionals) is left out.
 */
export function joinNewClub(
  squad: Squad, staff: StaffRecord, incoming: StaffMember[], at: { date: string; seasonEnd: string },
): StaffRecord {
  let members = [...staff.members];
  const factor = wageFactorOf(squad);
  for (const raw of incoming) {
    const m = settleCourses([raw], at.date).members[0]!;
    const same = members.filter((x) => x.role === m.role);
    if (same.length >= roleLimit(squad, m.role)) {
      const out = same.filter((x) => !x.trusted).sort((a, b) => memberStars(a) - memberStars(b) || a.id.localeCompare(b.id))[0];
      if (!out) continue;
      members = members.filter((x) => x.id !== out.id);
    }
    members.push(signContract(m, { ...at, years: TRUSTED.NEW_CLUB_YEARS, clubFactor: factor }));
  }
  const ids = new Set(members.map((m) => m.id));
  const areaAssignments = staff.areaAssignments
    ? Object.fromEntries(Object.entries(staff.areaAssignments).filter(([, id]) => ids.has(id!)))
    : undefined;
  return { members, ...(areaAssignments ? { areaAssignments } : {}) };
}
