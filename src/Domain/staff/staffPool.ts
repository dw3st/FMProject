import { STAFF } from "@/Domain/staff/staffConfig";
import { makeProfessional, memberStars, staffWageFor } from "@/Domain/staff/staff";
import { STAFF_ROLES, type StaffMember, type StaffRole } from "@/Domain/staff/staffTypes";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { isScoutRole, strongCountry } from "@/Domain/scouting/countryKnowledge";
import type { StaffNameBook } from "@/Domain/staff/staffOrigin";

/**
 * Free coaching-staff pool of a save (`saves/{id}/staffPool.json`, `.claude/rules/game/staff.md`).
 * Pure: generation, the partial refresh at the human country's rollover, search, take/return.
 */
export interface StaffPool {
  /** Season label it was generated / refreshed for (the year of the human club's league). */
  season: string;
  /**
   * Date (ISO) of the last refresh applied (or of the generation). A rollover of the human club's
   * country refreshes it once per date, whatever the season label of a league switched to.
   */
  refreshedOn?: string;
  members: StaffMember[];
}

/** A star target drawn from `POOL.STAR_BANDS` (band by share, then a half star inside it). */
export function sampleStars(rng: () => number): number {
  const bands = STAFF.POOL.STAR_BANDS;
  const total = bands.reduce((s, b) => s + b[2], 0);
  let x = rng() * total;
  let band = bands[bands.length - 1]!;
  for (const b of bands) {
    if (x < b[2]) { band = b; break; }
    x -= b[2];
  }
  const steps = Math.round((band[1] - band[0]) * 2) + 1;
  return band[0] + Math.floor(rng() * steps) / 2;
}

function fillRoles(members: StaffMember[], saveId: string, season: string, date: string, tag: string, book?: StaffNameBook): StaffMember[] {
  const rng = mulberry32(seedFrom(`staff-pool:${saveId}:${season}${tag}`));
  // The cheap professionals first, inside each role's quota: the pool keeps its size.
  const out = withCheapStaff([...members], saveId, date, `${season}${tag}`, book);
  const ids = new Set(out.map((m) => m.id));
  for (const role of STAFF_ROLES) {
    let have = out.filter((m) => m.role === role).length;
    for (let i = 0; have < STAFF.POOL.BY_ROLE[role]; i++) {
      const m = makeProfessional(`${saveId}:pool:${season}:${role}:${tag}${i}`, role, sampleStars(rng), book ? { book } : undefined);
      if (ids.has(m.id)) continue;
      ids.add(m.id);
      out.push({ ...m, since: date });
      have++;
    }
  }
  return out;
}

/** How many cheap professionals (`STAFF.CHEAP`) the free pool keeps of `role`. */
export const cheapQuota = (role: StaffRole): number => (role === "coach" ? STAFF.CHEAP.COACH : STAFF.CHEAP.PER_ROLE);

/** True when `m` asks the cheap wage (1★ or less). */
export const isCheapStaff = (m: StaffMember): boolean => memberStars(m) <= STAFF.CHEAP.MAX_STARS;

/**
 * Tops every role up to its cheap quota with professionals of 0.5★ and 1★ (alternating), deterministic by save,
 * tag and role, listed since `date`. They come on top of `POOL.BY_ROLE`. Returns the same array when nothing lacks.
 */
function withCheapStaff(members: StaffMember[], saveId: string, date: string, tag: string, book?: StaffNameBook): StaffMember[] {
  const ids = new Set(members.map((m) => m.id));
  let out = members;
  for (const role of STAFF_ROLES) {
    let have = members.filter((m) => m.role === role && isCheapStaff(m)).length;
    for (let i = 0; have < cheapQuota(role) && i < 100; i++) {
      const m = makeProfessional(`${saveId}:pool:cheap:${tag}:${role}:${i}`, role, i % 2 === 0 ? 0.5 : 1, book ? { book } : undefined);
      if (ids.has(m.id) || !isCheapStaff(m)) continue;
      ids.add(m.id);
      if (out === members) out = [...members];
      out.push({ ...m, since: date });
      have++;
    }
  }
  return out;
}

/**
 * Tops the cheap quota of every role up (a pool written before 12.19.2, or one whose cheap professionals were all
 * hired). The tag carries the date and the pool size, so a later top-up never redraws the id of one already hired.
 */
export function topUpCheapStaff(pool: StaffPool, saveId: string, date: string, book?: StaffNameBook): StaffPool {
  const members = withCheapStaff(pool.members, saveId, date, `t${date}:${pool.members.length}`, book);
  return members === pool.members ? pool : { ...pool, members };
}

/** True when every role has at least one cheap professional (the read of the pool tops it up otherwise). */
export const hasCheapStaff = (pool: StaffPool): boolean =>
  STAFF_ROLES.every((role) => pool.members.some((m) => m.role === role && isCheapStaff(m)));

/**
 * Keeps `POOL.LOCAL_SCOUTS` chief and field scouts of `country` (the human club's) in the pool: the weighted draw
 * gives a country with few clubs almost none (tester report c34a5e33). Ids carry the date and the pool size, so a
 * later top-up never redraws a hired one. The same object when nothing lacks.
 */
export function topUpLocalScouts(pool: StaffPool, saveId: string, date: string, country: string, book: StaffNameBook): StaffPool {
  if (!book[country]) return pool;
  const ids = new Set(pool.members.map((m) => m.id));
  let members = pool.members;
  for (const role of ["scout", "fieldScout"] as const) {
    const want = STAFF.POOL.LOCAL_SCOUTS[role];
    let have = members.filter((m) => m.role === role && m.nationality === country).length;
    const rng = mulberry32(seedFrom(`staff-pool-local:${saveId}:${country}:${date}:${role}`));
    for (let i = 0; have < want && i < 80; i++) {
      const m = makeProfessional(`${saveId}:pool:local:${country}:${date}:${pool.members.length}:${role}:${i}`, role, sampleStars(rng), { book, home: country });
      if (ids.has(m.id) || m.nationality !== country) continue;
      ids.add(m.id);
      if (members === pool.members) members = [...pool.members];
      members.push({ ...m, since: date });
      have++;
    }
  }
  return members === pool.members ? pool : { ...pool, members };
}

/** `book`: nationalities and names from the world's players (`staffOrigin.ts`); absent = the built-in pools. */
export function generatePool(saveId: string, season: string, date: string, book?: StaffNameBook): StaffPool {
  return { season, refreshedOn: date, members: fillRoles([], saveId, season, date, "", book) };
}

/**
 * A pool written before a role existed (the youth coach, 12.1) has nobody of it: the role's quota is added,
 * deterministic by save and role, listed since `date`. A pool with at least one professional of every role
 * comes back unchanged (the same object).
 */
export function topUpMissingRoles(pool: StaffPool, saveId: string, date: string, book?: StaffNameBook): StaffPool {
  const missing = STAFF_ROLES.filter((role) => !pool.members.some((m) => m.role === role));
  if (missing.length === 0) return pool;
  const ids = new Set(pool.members.map((m) => m.id));
  const members = [...pool.members];
  for (const role of missing) {
    const rng = mulberry32(seedFrom(`staff-pool-topup:${saveId}:${role}`));
    let have = 0;
    for (let i = 0; have < STAFF.POOL.BY_ROLE[role]; i++) {
      const m = makeProfessional(`${saveId}:pool:topup:${role}:${i}`, role, sampleStars(rng), book ? { book } : undefined);
      if (ids.has(m.id)) continue;
      ids.add(m.id);
      members.push({ ...m, since: date });
      have++;
    }
  }
  return { ...pool, members };
}

/**
 * The human club's country rolled on `date`: everyone a year older, the 68+ retire, a third of the
 * longest-listed leave, and each role is filled back to `POOL.BY_ROLE`. Applied once per date: a
 * pool already refreshed on (or generated after) `date` is returned unchanged.
 */
export function refreshPool(pool: StaffPool, saveId: string, season: string, date: string, book?: StaffNameBook): StaffPool {
  if (pool.refreshedOn !== undefined && pool.refreshedOn >= date) return pool;
  const aged = pool.members.map((m) => ({ ...m, age: m.age + 1 })).filter((m) => m.age < STAFF.POOL.RETIRE_AGE);
  const drop = Math.floor(STAFF.POOL.REFRESH_SHARE * aged.length);
  const oldest = [...aged]
    .sort((a, b) => (a.since ?? "").localeCompare(b.since ?? "") || a.id.localeCompare(b.id))
    .slice(0, drop);
  const gone = new Set(oldest.map((m) => m.id));
  // The tag carries the date: two refreshes under the same season label never redraw the same ids.
  return { season, refreshedOn: date, members: fillRoles(aged.filter((m) => !gone.has(m.id)), saveId, season, date, `r${date}:`, book) };
}

export function takeFromPool(pool: StaffPool, id: string): { pool: StaffPool; member: StaffMember } | null {
  const member = pool.members.find((m) => m.id === id);
  if (!member) return null;
  return { pool: { ...pool, members: pool.members.filter((m) => m.id !== id) }, member };
}

/** A fired or departing professional goes back without his contract, listed since `date`. */
export function returnToPool(pool: StaffPool, member: StaffMember, date: string): StaffPool {
  // Out of the club he is nobody's trusted professional, and a course in progress is lost.
  const { contract: _c, trusted: _t, course: _k, ...rest } = member;
  const back: StaffMember = { ...rest, since: date };
  return { ...pool, members: [...pool.members.filter((m) => m.id !== member.id), back] };
}

export const STAFF_POOL_SORTS = ["name", "role", "age", "stars", "wage"] as const;
export type StaffPoolSort = (typeof STAFF_POOL_SORTS)[number];
export type StaffPoolSortDir = "asc" | "desc";
export const isStaffPoolSort = (v: unknown): v is StaffPoolSort => (STAFF_POOL_SORTS as readonly unknown[]).includes(v);
/** The direction a column opens in: best first for stars, A-Z / youngest / cheapest for the rest. */
export const defaultPoolSortDir = (sort: StaffPoolSort): StaffPoolSortDir => (sort === "stars" ? "desc" : "asc");
export interface StaffPoolQuery {
  role?: StaffRole;
  minStars?: number;
  maxWage?: number;
  sort?: StaffPoolSort;
  /** Absent: `defaultPoolSortDir(sort)`. */
  dir?: StaffPoolSortDir;
  offset?: number;
  limit?: number;
}
export type StaffPoolItem = StaffMember & { stars: number; askingWage: number; strongCountry?: { country: string; k: number } };

export const POOL_PAGE = { DEFAULT: 50, MAX: 100 } as const;

/** Filter, sort and page the pool; the asking wage is what the user's club would pay (its wage factor). */
/** With `date`, scouts also carry their strongest country (`strongCountry`). */
export function searchPool(pool: StaffPool, q: StaffPoolQuery, clubFactor: number, date?: string, revenue?: number): { total: number; items: StaffPoolItem[] } {
  const items: StaffPoolItem[] = pool.members
    .map((m) => {
      const stars = memberStars(m);
      return {
        ...m, stars, askingWage: staffWageFor(m.role, stars, clubFactor, revenue),
        ...(date && isScoutRole(m.role) ? { strongCountry: strongCountry(m, date) } : {}),
      };
    })
    .filter((m) => (!q.role || m.role === q.role)
      && (q.minStars === undefined || m.stars >= q.minStars)
      && (q.maxWage === undefined || m.askingWage <= q.maxWage));
  const sort = q.sort ?? "stars";
  const sign = (q.dir ?? defaultPoolSortDir(sort)) === "asc" ? 1 : -1;
  const roleIndex = (r: StaffRole) => (STAFF_ROLES as readonly StaffRole[]).indexOf(r);
  const key = (a: StaffPoolItem, b: StaffPoolItem): number => {
    switch (sort) {
      case "name": return a.name.localeCompare(b.name);
      case "role": return roleIndex(a.role) - roleIndex(b.role);
      case "age": return a.age - b.age;
      case "stars": return a.stars - b.stars;
      case "wage": return a.askingWage - b.askingWage;
    }
  };
  // The id breaks ties the same way in both directions, so paging stays stable.
  items.sort((a, b) => sign * key(a, b) || a.id.localeCompare(b.id));
  const offset = Math.max(0, q.offset ?? 0);
  const limit = Math.min(POOL_PAGE.MAX, Math.max(1, q.limit ?? POOL_PAGE.DEFAULT));
  return { total: items.length, items: items.slice(offset, offset + limit) };
}
