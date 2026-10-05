import { AI_MANAGERS } from "@/Domain/managers/aiManagersConfig";
import { rankPercentile, recentTitlePoints } from "@/Domain/jobs/jobs";
import { JOBS } from "@/Domain/jobs/jobsConfig";
import { addDays, daysBetween } from "@/Domain/dates";
import type { FinancialTier } from "@/types/playerTypes";
import type { ManagerLeftReason, ManagerRecord } from "@/types/managerTypes";
import { cleanRecord, closePassage, makeInterim, toFree } from "@/Domain/managers/managerRecords";

/**
 * AI managers (`.claude/rules/game/managers.md`, Etapa 25): sackings by bad results (a rule, not a
 * simulation), the free pool and hirings. Pure: no I/O; the draws use an injected rng.
 */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// ── Sacking ───────────────────────────────────────────────────────────────────

/** Points per game of a W/D/L form list (null when empty). */
export function formPpg(form: readonly ("W" | "D" | "L")[] | undefined): number | null {
  if (!form || form.length === 0) return null;
  return form.reduce((s, r) => s + (r === "W" ? 3 : r === "D" ? 1 : 0), 0) / form.length;
}

export interface SackInput {
  /** 1-based table position. */
  position: number;
  /** Worst position that still meets the club's objective. */
  target: number;
  size: number;
  /** Points per game of the recent form (null = no games yet). */
  form: number | null;
  tier: FinancialTier;
  /** Days since the manager was hired (absent = in charge since the career start). */
  daysInCharge?: number;
  /** Share of the league's rounds played (0..1). */
  progress: number;
  /** Rounds still to play. */
  roundsLeft: number;
  /** The club already sacked a manager this season. */
  sackedThisSeason: boolean;
  /** The current manager is an interim (never sacked: he only waits for the hire). */
  interim?: boolean;
}

/** Weekly (Monday) chance the club sacks its manager. */
export function weeklySackChance(i: SackInput): number {
  const c = AI_MANAGERS.sack;
  if (i.interim || i.sackedThisSeason) return 0;
  if (i.progress < c.MIN_PROGRESS || i.roundsLeft < c.LAST_ROUNDS_SAFE) return 0;
  if (i.daysInCharge !== undefined && i.daysInCharge < c.PROTECT_DAYS) return 0;
  const pressure = (i.position - i.target) / Math.max(1, i.size);
  if (pressure < c.PRESSURE_MIN) return 0;
  if (i.form !== null && i.form >= c.FORM_SAFE) return 0;
  const base = Math.min(c.MAX_P, c.BASE_P + c.SLOPE * (pressure - c.PRESSURE_MIN));
  return base * c.PATIENCE[i.tier] * (i.form !== null && i.form < c.FORM_BAD ? c.FORM_BAD_MULT : 1);
}

/** Chance of a sacking at the country rollover from the final table. */
export function rolloverSackChance(i: {
  position: number; target: number; size: number;
  relegated?: boolean; promoted?: boolean; champion?: boolean; interim?: boolean;
}): number {
  if (i.interim || i.champion || i.promoted) return 0;
  if (i.relegated) return AI_MANAGERS.rollover.RELEGATED;
  return (i.position - i.target) / Math.max(1, i.size) >= AI_MANAGERS.rollover.FAILED_GAP ? AI_MANAGERS.rollover.FAILED : 0;
}

/** Final position as a percentile (1 = champion, 0 = last). */
export function finishPercentile(position: number, size: number): number {
  return size > 1 ? clamp(1 - (position - 1) / (size - 1), 0, 1) : 1;
}

// ── Records ──────────────────────────────────────────────────────────────────

export { closePassage, interimId, interimName, makeInterim, toFree } from "@/Domain/managers/managerRecords";

/**
 * The club's manager goes to the free pool (`left`, default "sacked") and an interim takes over so
 * the club always has one. The human manager is never touched here.
 */
export function sackManager(
  managers: ManagerRecord[],
  args: { squadId: string; clubName: string; date: string; left?: ManagerLeftReason },
): ManagerRecord[] {
  const out = managers.map((m) =>
    !m.isPlayer && m.squadId === args.squadId ? toFree(m, args.date, args.left ?? "sacked") : m);
  if (!out.some((m) => m.squadId === args.squadId)) {
    out.push(makeInterim(args.squadId, args.clubName, args.date, new Set(out.map((m) => m.id))));
  }
  return out;
}

/**
 * `managerId` takes over `squadId` on `date`. The club's outgoing manager (the interim, or a coach
 * displaced by the human) is dropped when he is an interim with no ranking points and no title,
 * else he becomes free. A poached manager leaves his club: `vacated` (the caller gives it an
 * interim + vacancy).
 */
export function hireManager(
  managers: ManagerRecord[],
  args: { squadId: string; managerId: string; date: string },
): { managers: ManagerRecord[]; vacated: string | null } {
  const hired = managers.find((m) => m.id === args.managerId);
  if (!hired) return { managers, vacated: null };
  const vacated = hired.squadId && hired.squadId !== args.squadId ? hired.squadId : null;
  const out: ManagerRecord[] = [];
  for (const m of managers) {
    if (m.id === args.managerId) {
      if (m.squadId === args.squadId) {
        // The interim is confirmed: same passage, no longer interim.
        out.push(cleanRecord({ ...m, interim: undefined, hiredOn: args.date }));
      } else {
        const clubs = vacated ? closePassage(m.clubs, args.date, "moved") : (m.clubs ?? []);
        out.push(cleanRecord({
          ...m, squadId: args.squadId, hiredOn: args.date, freeSince: undefined, interim: undefined, retired: undefined,
          clubs: [...clubs, { squadId: args.squadId, from: args.date }],
        }));
      }
      continue;
    }
    if (!m.isPlayer && m.squadId === args.squadId) {
      if (m.interim && m.points === 0 && m.titles.length === 0) continue;
      out.push(toFree(m, args.date, m.interim ? "interim" : "moved"));
      continue;
    }
    out.push(m);
  }
  return { managers: out, vacated };
}

/** Free managers out for more than RETIRE_AFTER_DAYS retire (kept in the file, off the pool). */
export function retireStale(managers: ManagerRecord[], date: string): ManagerRecord[] {
  let changed = false;
  const out = managers.map((m) => {
    if (m.isPlayer || m.squadId || m.retired || !m.freeSince) return m;
    if (daysBetween(m.freeSince, date) <= AI_MANAGERS.RETIRE_AFTER_DAYS) return m;
    changed = true;
    return { ...m, retired: true as const };
  });
  return changed ? out : managers;
}

/** Clubs that sacked a manager since `since` (one sacking per club per season). */
export function clubsSackedSince(managers: ManagerRecord[], since: string): Set<string> {
  const out = new Set<string>();
  for (const m of managers) {
    for (const c of m.clubs ?? []) if (c.left === "sacked" && c.to && c.to >= since) out.add(c.squadId);
  }
  return out;
}

/** Invariant check: every club has exactly one manager (returns the clubs breaking it). */
export function managerInvariantBreaks(managers: ManagerRecord[], squadIds: Iterable<string>): { missing: string[]; doubled: string[] } {
  const count = new Map<string, number>();
  for (const m of managers) if (m.squadId) count.set(m.squadId, (count.get(m.squadId) ?? 0) + 1);
  const missing: string[] = [];
  for (const id of squadIds) if (!count.has(id)) missing.push(id);
  return { missing, doubled: [...count.entries()].filter(([, n]) => n > 1).map(([id]) => id) };
}

// ── Reputation and hiring ────────────────────────────────────────────────────

/** AI manager reputation 0..100: ranking 45, last finish 30 (absent = 0,5), titles 15, seasons 10. */
export function aiManagerReputation(managers: ManagerRecord[], m: ManagerRecord, year: number): number {
  const c = JOBS.reputation;
  const v =
    c.RANK_WEIGHT * clamp(rankPercentile(managers, m.id), 0, 1) +
    c.BOARD_WEIGHT * clamp(m.lastFinish ?? 0.5, 0, 1) +
    c.TITLES_WEIGHT * clamp(recentTitlePoints(m.titles, year) / c.TITLES_SATURATION, 0, 1) +
    c.SEASONS_WEIGHT * clamp(m.seasons / c.SEASONS_SATURATION, 0, 1);
  return Math.round(v * 10) / 10;
}

export interface HireCandidate {
  managerId: string;
  reputation: number;
  country: string | null;
  continent: string | null;
  /** Free: days since he left his last club. */
  freeDays?: number;
  /** Employed: prestige of his club (poach only from clubs at least POACH_GAP below). */
  clubPrestige?: number;
  /** The club's interim: the club's points per game under him. */
  interimPpg?: number;
}

export interface HireRequest {
  /** Prestige 0..1 of the hiring club (target reputation = prestige × 100). */
  prestige: number;
  country: string | null;
  continent: string | null;
  free: HireCandidate[];
  employed: HireCandidate[];
  interim: HireCandidate | null;
  /** Poaching allowed today (at most one chain per day). */
  allowPoach: boolean;
  rng: () => number;
}

function locationWeight(c: HireCandidate, r: HireRequest): number {
  if (r.country && c.country === r.country) return 3;
  if (r.continent && c.continent === r.continent) return 2;
  return 1;
}

/** Who the club hires: the best free candidate, sometimes a poached manager, or the interim. */
export function chooseHire(r: HireRequest): { managerId: string; kind: "free" | "poach" | "interim" } | null {
  const h = AI_MANAGERS.hire;
  const target = r.prestige * 100;
  const score = (c: HireCandidate) =>
    -Math.abs(c.reputation - target) + h.LOCATION_WEIGHT * locationWeight(c, r) + (r.rng() - 0.5) * h.NOISE;
  const options: { id: string; kind: "free" | "poach" | "interim"; s: number }[] = [];
  for (const c of r.free) {
    if (c.reputation > target + h.OVERQUALIFIED && (c.freeDays ?? 0) <= h.OVERQUALIFIED_DAYS) continue;
    options.push({ id: c.managerId, kind: "free", s: score(c) });
  }
  if (r.allowPoach && r.employed.length > 0 && r.rng() < h.POACH_CHANCE) {
    const eligible = r.employed.filter((c) => (c.clubPrestige ?? 1) <= r.prestige - h.POACH_GAP);
    const best = [...eligible].sort((a, b) => b.reputation - a.reputation)[0];
    if (best) options.push({ id: best.managerId, kind: "poach", s: score(best) + h.LOCATION_WEIGHT });
  }
  if (r.interim) {
    options.push({
      id: r.interim.managerId, kind: "interim",
      s: score(r.interim) + ((r.interim.interimPpg ?? 0) >= h.INTERIM_PPG ? h.INTERIM_BONUS : 0),
    });
  }
  const best = options.sort((a, b) => b.s - a.s)[0];
  return best ? { managerId: best.id, kind: best.kind } : null;
}

/** Day the vacant club hires: MIN_DAYS..MAX_DAYS after `since`. */
export function vacancyHireOn(since: string, rng: () => number): string {
  const v = AI_MANAGERS.vacancy;
  return addDays(since, v.MIN_DAYS + Math.floor(rng() * (v.MAX_DAYS - v.MIN_DAYS + 1)));
}
