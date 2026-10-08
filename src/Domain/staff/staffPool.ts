import { STAFF } from "@/Domain/staff/staffConfig";
import { makeProfessional, memberStars, staffWageFor } from "@/Domain/staff/staff";
import { STAFF_ROLES, type StaffMember, type StaffRole } from "@/Domain/staff/staffTypes";
import { mulberry32, seedFrom } from "@/Domain/rng";
import { isScoutRole, strongCountry } from "@/Domain/scouting/countryKnowledge";

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

function fillRoles(members: StaffMember[], saveId: string, season: string, date: string, tag: string): StaffMember[] {
  const rng = mulberry32(seedFrom(`staff-pool:${saveId}:${season}${tag}`));
  const ids = new Set(members.map((m) => m.id));
  const out = [...members];
  for (const role of STAFF_ROLES) {
    let have = out.filter((m) => m.role === role).length;
    for (let i = 0; have < STAFF.POOL.BY_ROLE[role]; i++) {
      const m = makeProfessional(`${saveId}:pool:${season}:${role}:${tag}${i}`, role, sampleStars(rng));
      if (ids.has(m.id)) continue;
      ids.add(m.id);
      out.push({ ...m, since: date });
      have++;
    }
  }
  return out;
}

export function generatePool(saveId: string, season: string, date: string): StaffPool {
  return { season, refreshedOn: date, members: fillRoles([], saveId, season, date, "") };
}

/**
 * The human club's country rolled on `date`: everyone a year older, the 68+ retire, a third of the
 * longest-listed leave, and each role is filled back to `POOL.BY_ROLE`. Applied once per date: a
 * pool already refreshed on (or generated after) `date` is returned unchanged.
 */
export function refreshPool(pool: StaffPool, saveId: string, season: string, date: string): StaffPool {
  if (pool.refreshedOn !== undefined && pool.refreshedOn >= date) return pool;
  const aged = pool.members.map((m) => ({ ...m, age: m.age + 1 })).filter((m) => m.age < STAFF.POOL.RETIRE_AGE);
  const drop = Math.floor(STAFF.POOL.REFRESH_SHARE * aged.length);
  const oldest = [...aged]
    .sort((a, b) => (a.since ?? "").localeCompare(b.since ?? "") || a.id.localeCompare(b.id))
    .slice(0, drop);
  const gone = new Set(oldest.map((m) => m.id));
  // The tag carries the date: two refreshes under the same season label never redraw the same ids.
  return { season, refreshedOn: date, members: fillRoles(aged.filter((m) => !gone.has(m.id)), saveId, season, date, `r${date}:`) };
}

export function takeFromPool(pool: StaffPool, id: string): { pool: StaffPool; member: StaffMember } | null {
  const member = pool.members.find((m) => m.id === id);
  if (!member) return null;
  return { pool: { ...pool, members: pool.members.filter((m) => m.id !== id) }, member };
}

/** A fired or departing professional goes back without his contract, listed since `date`. */
export function returnToPool(pool: StaffPool, member: StaffMember, date: string): StaffPool {
  const { contract: _c, ...rest } = member;
  const back: StaffMember = { ...rest, since: date };
  return { ...pool, members: [...pool.members.filter((m) => m.id !== member.id), back] };
}

export type StaffPoolSort = "stars" | "wage" | "age";
export interface StaffPoolQuery {
  role?: StaffRole;
  minStars?: number;
  maxWage?: number;
  sort?: StaffPoolSort;
  offset?: number;
  limit?: number;
}
export type StaffPoolItem = StaffMember & { stars: number; askingWage: number; strongCountry?: { country: string; k: number } };

export const POOL_PAGE = { DEFAULT: 50, MAX: 100 } as const;

/** Filter, sort and page the pool; the asking wage is what the user's club would pay (its wage factor). */
/** With `date`, scouts also carry their strongest country (`strongCountry`). */
export function searchPool(pool: StaffPool, q: StaffPoolQuery, clubFactor: number, date?: string): { total: number; items: StaffPoolItem[] } {
  const items: StaffPoolItem[] = pool.members
    .map((m) => {
      const stars = memberStars(m);
      return {
        ...m, stars, askingWage: staffWageFor(m.role, stars, clubFactor),
        ...(date && isScoutRole(m.role) ? { strongCountry: strongCountry(m, date) } : {}),
      };
    })
    .filter((m) => (!q.role || m.role === q.role)
      && (q.minStars === undefined || m.stars >= q.minStars)
      && (q.maxWage === undefined || m.askingWage <= q.maxWage));
  const sort = q.sort ?? "stars";
  items.sort((a, b) => {
    const d = sort === "stars" ? b.stars - a.stars : sort === "wage" ? a.askingWage - b.askingWage : a.age - b.age;
    return d || a.id.localeCompare(b.id);
  });
  const offset = Math.max(0, q.offset ?? 0);
  const limit = Math.min(POOL_PAGE.MAX, Math.max(1, q.limit ?? POOL_PAGE.DEFAULT));
  return { total: items.length, items: items.slice(offset, offset + limit) };
}
