import { addDays, isRealIsoDate } from "@/Domain/dates";
import type { MemberAdvanceStatus } from "@/types/groupAdvanceTypes";
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
  if (req === "next_match") return { ok: true, readyUntil: laterDate(nextMatchAfterToday, tomorrow) };
  if (typeof req !== "string" || !isRealIsoDate(req)) return { ok: false, error: "invalidDate" };
  if (req < tomorrow || req > addDays(currentDate, GROUP_ADVANCE.MAX_READY_DAYS)) return { ok: false, error: "invalidDate" };
  return { ok: true, readyUntil: req };
}

/** One seat as the group target sees it. */
export interface GroupSeatInput {
  seatId: string;
  /** Stop date the seat accepts; null/absent or <= today = not ready. */
  readyUntil: string | null | undefined;
  /** The seat's next unplayed official game (club or national) on or after today; null when none or unemployed. */
  nextMatch: string | null;
  /** Date of his settled game (`matchDecision.date`), or null. */
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

/** The seat's own stop date and whether today's undecided game is what stops him. */
export function seatLimit(s: GroupSeatInput, currentDate: string): { limit: string; matchToday: boolean } {
  const ready = s.readyUntil && s.readyUntil > currentDate ? s.readyUntil : currentDate;
  const matchStop = !s.unemployed && s.nextMatch && s.nextMatch >= currentDate && s.decisionDate !== s.nextMatch
    ? s.nextMatch
    : null;
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
  if (s.unemployed) return "no_club";
  const { limit, matchToday } = seatLimit(s, currentDate);
  if (matchToday) return "match";
  return limit > currentDate ? "ready" : "late";
}
