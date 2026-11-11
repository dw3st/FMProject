import { JOBS } from "@/Domain/jobs/jobsConfig";

/**
 * Job security of a club's manager and the human's applications (8.9.29, tester report): pure, no I/O.
 * The security reads the same inputs as the AI sacking rule (`weeklySackChance`): table position against the
 * board's target, recent form and time in charge.
 */

export type SecurityLevel = 1 | 2 | 3 | 4 | 5;

export interface SecurityInput {
  /** 1-based table position (absent before the first round). */
  position?: number;
  target: number;
  size: number;
  /** Points per game of the recent form (null = no games). */
  form: number | null;
  /** Share of the league's rounds played (0..1). */
  progress: number;
  daysInCharge?: number;
}

/** Sacking risk: below zero the manager beats the board's target. */
export function securityRisk(i: SecurityInput): number {
  const c = JOBS.application;
  if (i.position === undefined || i.size <= 0) return 0;
  const pressure = (i.position - i.target) / i.size;
  const form = i.form === null ? 0 : (c.FORM_REF - i.form) * c.FORM_WEIGHT;
  let risk = (pressure + form) * Math.min(1, i.progress / c.FULL_PROGRESS);
  if (i.daysInCharge !== undefined && i.daysInCharge < c.NEW_DAYS) risk *= 0.5;
  return risk;
}

/** 1 = very secure … 5 = very threatened. */
export function securityLevel(i: SecurityInput): SecurityLevel {
  const r = securityRisk(i);
  const [a, b, c, d] = JOBS.application.LEVELS as readonly number[];
  if (r <= a!) return 1;
  if (r <= b!) return 2;
  if (r < c!) return 3;
  if (r < d!) return 4;
  return 5;
}

/**
 * Chance the board says yes: the level's base (an interim club: VACANT) × how well the manager's reputation
 * fits the club's prestige.
 */
export function applicationChance(args: { level: SecurityLevel | "vacant"; prestige: number; reputation: number }): number {
  const c = JOBS.application;
  const base = args.level === "vacant" ? c.VACANT : c.BASE[args.level - 1]!;
  const gap = Math.max(0, args.prestige - args.reputation / 100 - c.FIT_SLACK);
  const fit = Math.max(c.FIT_FLOOR, 1 - gap * c.FIT_SLOPE);
  return Math.min(1, base * fit);
}

/** Days until the answer: ANSWER_MIN..ANSWER_MAX. */
export function answerDelay(rng: () => number): number {
  const c = JOBS.application;
  return c.ANSWER_MIN_DAYS + Math.floor(rng() * (c.ANSWER_MAX_DAYS - c.ANSWER_MIN_DAYS + 1));
}

/** The refusals still blocking a new application (older than RETRY_DAYS dropped). */
export function liveRefusals(refused: Record<string, string> | undefined, date: string, daysBetween: (a: string, b: string) => number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, on] of Object.entries(refused ?? {})) if (daysBetween(on, date) < JOBS.application.RETRY_DAYS) out[id] = on;
  return out;
}
