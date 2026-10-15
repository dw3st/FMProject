import { addDays, isRealIsoDate } from "@/Domain/dates";
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
