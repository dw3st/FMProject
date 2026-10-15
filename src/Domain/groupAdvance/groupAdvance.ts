import { addDays, isRealIsoDate } from "@/Domain/dates";
import type { MemberAdvanceStatus } from "@/types/groupAdvanceTypes";
import type { WorldDeadline } from "@/types/multiplayerTypes";
import { GROUP_ADVANCE } from "@/Domain/groupAdvance/groupAdvanceConfig";

/** A world advanced by the group (part 3): multi with a world state (lobby or running). */
export function isGroupWorld(meta: { mode: string; world?: unknown }): boolean {
  return meta.mode === "multi" && !!meta.world;
}

/** The later of two dates (`undefined`/`null` lose). */
export function laterDate(a: string | null | undefined, b: string): string {
  return a && a > b ? a : b;
}

export type ResolveReady = { ok: true; readyUntil: string | null } | { ok: false; error: "invalidDate" };

/**
 * `POST /ready` body -> the stop date. `next_match` stops ON the seat's next game after today (the eve is the last day
 * run); without one it is tomorrow. A date must be real, from tomorrow on, at most `MAX_READY_DAYS` ahead.
 */
export function resolveReadyUntil(req: unknown, currentDate: string, nextMatchAfterToday: string | null): ResolveReady {
  if (req === null) return { ok: true, readyUntil: null };
  const tomorrow = addDays(currentDate, 1);
  if (req === "tomorrow") return { ok: true, readyUntil: tomorrow };
  // next_match is capped too: a game further than MAX_READY_DAYS is not a stop worth waiting for.
  if (req === "next_match") {
    const until = laterDate(nextMatchAfterToday, tomorrow);
    return { ok: true, readyUntil: until > addDays(currentDate, GROUP_ADVANCE.MAX_READY_DAYS) ? tomorrow : until };
  }
  if (typeof req !== "string" || !isRealIsoDate(req)) return { ok: false, error: "invalidDate" };
  if (req < tomorrow || req > addDays(currentDate, GROUP_ADVANCE.MAX_READY_DAYS)) return { ok: false, error: "invalidDate" };
  return { ok: true, readyUntil: req };
}

/** One seat as the group target sees it. */
export interface GroupSeatInput {
  seatId: string;
  /** Stop date the seat accepts; null/absent or <= today = not ready. */
  readyUntil: string | null | undefined;
  /** Dates (ascending, may repeat) of his unplayed official games (club or national) on or after today; [] when none. */
  matchDates: readonly string[];
  /** Date of his settled game (`matchDecision.date`), or null. Skipped when looking for the next game to decide. */
  decisionDate: string | null;
  unemployed: boolean;
}

export interface GroupPlan {
  /** The `currentDate` the world advances to (days before it run). */
  target: string;
  /** Seats holding the world today (empty while it can run). */
  waitingFor: string[];
  /** The ones of `waitingFor` held by a game of today to decide. */
  matchWaiting: string[];
}

/** First game on or after `currentDate` without a decision (a decided game never stops the world). */
export function nextUndecided(
  s: Pick<GroupSeatInput, "matchDates" | "decisionDate" | "unemployed">,
  currentDate: string,
): string | null {
  if (s.unemployed) return null;
  return s.matchDates.find((d) => d >= currentDate && d !== s.decisionDate) ?? null;
}

/** The seat's own stop date and whether today's undecided game is what stops him. */
export function seatLimit(s: GroupSeatInput, currentDate: string): { limit: string; matchToday: boolean } {
  const ready = s.readyUntil && s.readyUntil > currentDate ? s.readyUntil : currentDate;
  const matchStop = nextUndecided(s, currentDate);
  const limit = matchStop && matchStop < ready ? matchStop : ready;
  return { limit, matchToday: matchStop === currentDate };
}

/** `target = min(stop of every seat)`; when it is today, the seats at today hold the world. */
export function computeGroupTarget(currentDate: string, seats: readonly GroupSeatInput[]): GroupPlan {
  if (seats.length === 0) return { target: currentDate, waitingFor: [], matchWaiting: [] };
  const limits = seats.map((s) => ({ seatId: s.seatId, ...seatLimit(s, currentDate) }));
  const target = limits.reduce((min, l) => (l.limit < min ? l.limit : min), limits[0]!.limit);
  const blocking = target <= currentDate ? limits.filter((l) => l.limit <= currentDate) : [];
  return {
    target,
    waitingFor: blocking.map((l) => l.seatId),
    matchWaiting: blocking.filter((l) => l.matchToday).map((l) => l.seatId),
  };
}

/** Status of a member on the league screen. */
export function memberStatus(s: GroupSeatInput, currentDate: string): MemberAdvanceStatus {
  const { limit, matchToday } = seatLimit(s, currentDate);
  if (matchToday) return "match";
  if (limit <= currentDate) return "late";
  return s.unemployed ? "no_club" : "ready";
}

const HOUR_MS = 3_600_000;

/** When the world goes on without the late ones, or null (no deadline, or not waiting). */
export function deadlineAt(waitingSince: string | null, hours: WorldDeadline): string | null {
  if (!waitingSince || hours == null) return null;
  const since = Date.parse(waitingSince);
  if (Number.isNaN(since)) return null;
  return new Date(since + hours * HOUR_MS).toISOString();
}

export function deadlinePassed(waitingSince: string | null, hours: WorldDeadline, nowMs: number): boolean {
  const at = deadlineAt(waitingSince, hours);
  return at !== null && nowMs >= Date.parse(at);
}

export interface AssistantPatch {
  seatId: string;
  readyUntil: string;
  /** The game the assistant simulates for him (the executor finds the fixture), or null. */
  decisionDate: string | null;
}

/**
 * Deadline passed: each late seat goes to the smallest stop of the seats that are ready (tomorrow when nobody is) and
 * the assistant simulates his first game before that stop. A game ON the stop date is the next stop.
 */
export function assistantPatches(currentDate: string, seats: readonly GroupSeatInput[], plan: GroupPlan): AssistantPatch[] {
  const late = new Set(plan.waitingFor);
  const others = seats.filter((s) => !late.has(s.seatId)).map((s) => seatLimit(s, currentDate).limit);
  const tomorrow = addDays(currentDate, 1);
  const until = laterDate(others.length > 0 ? others.reduce((m, d) => (d < m ? d : m)) : null, tomorrow);
  return seats.filter((s) => late.has(s.seatId)).map((s) => {
    const next = nextUndecided(s, currentDate);
    return { seatId: s.seatId, readyUntil: until, decisionDate: next !== null && next < until ? next : null };
  });
}

/** The seat's part of a day asks him to look before the world goes on: sacked, a job/national offer, his season end. */
export function seatStops(part: Record<string, unknown>): boolean {
  return part.sacked === true
    || (typeof part.jobOffers === "number" && part.jobOffers > 0)
    || part.seasonEnded === true;
}
