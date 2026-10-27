import { addDays } from "@/Domain/dates";
import { PUBLIC_WORLD } from "@/Domain/multiplayer/publicWorldConfig";
import { seatLimit, type GroupSeatInput } from "@/Domain/groupAdvance/groupAdvance";

const DAY_MS = 86_400_000;

/** The instant (ISO, UTC) of a Brasília local time on the Brasília day `localDay` (YYYY-MM-DD). */
export function slotAt(localDay: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const utc = Date.parse(`${localDay}T00:00:00.000Z`) + ((h! * 60 + m!) - PUBLIC_WORLD.UTC_OFFSET_MIN) * 60_000;
  return new Date(utc).toISOString();
}

/** Slot instants of the Brasília days around `nowMs` (yesterday, today, tomorrow), ascending. */
function slotsAround(nowMs: number): string[] {
  const localToday = new Date(nowMs + PUBLIC_WORLD.UTC_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
  const out: string[] = [];
  for (const d of [-1, 0, 1]) {
    const day = new Date(Date.parse(`${localToday}T00:00:00.000Z`) + d * DAY_MS).toISOString().slice(0, 10);
    for (const s of PUBLIC_WORLD.SLOTS) out.push(slotAt(day, s));
  }
  return out;
}

/** The latest slot at or before `nowMs` when it is newer than `lastSlot`; else null (several missed = one step). */
export function dueSlot(nowMs: number, lastSlot: string | null): string | null {
  const passed = slotsAround(nowMs).filter((s) => Date.parse(s) <= nowMs);
  const latest = passed.at(-1) ?? null;
  if (!latest) return null;
  return lastSlot && lastSlot >= latest ? null : latest;
}

/** The first slot after `nowMs`. */
export function nextSlotAt(nowMs: number): string {
  return slotsAround(nowMs).find((s) => Date.parse(s) > nowMs)!;
}

/**
 * Where one step stops: the first seat game day after `currentDate` (the parked day is played); without seat games,
 * the first round day of the world's leagues after it; nothing ahead = `horizon` when given (a break with no game
 * goes by in one step), else one day. Dates ascending.
 */
export function publicStepTarget(
  currentDate: string, seatGameDays: readonly string[], worldRoundDays: readonly string[], horizon?: string,
): string {
  return seatGameDays.find((d) => d > currentDate)
    ?? worldRoundDays.find((d) => d > currentDate)
    ?? (horizon && horizon > currentDate ? horizon : addDays(currentDate, 1));
}

/** Whether a seat counts for an early step: opened the world in the last `ACTIVE_HOURS` (ms of the last request). */
export function isActiveSeat(lastSeenMs: number | null, nowMs: number): boolean {
  return lastSeenMs != null && nowMs - lastSeenMs < PUBLIC_WORLD.ACTIVE_HOURS * 3_600_000;
}

/**
 * Early step: the step to `target` starts before the next slot when every active seat with a club is ready up to it
 * (the same rule as the friends' league: "ready until" reaches `target` and today's game is decided), at least one
 * such seat exists, and the last step began `EARLY_STEP_GAP_MIN` minutes ago or more.
 */
export function earlyStepDue(
  currentDate: string, target: string, activeSeats: readonly GroupSeatInput[], lastStepAt: string | null, nowMs: number,
): boolean {
  if (target <= currentDate) return false;
  if (lastStepAt && nowMs - Date.parse(lastStepAt) < PUBLIC_WORLD.EARLY_STEP_GAP_MIN * 60_000) return false;
  const seats = activeSeats.filter((s) => !s.unemployed);
  return seats.length > 0 && seats.every((s) => seatLimit(s, currentDate).limit >= target);
}

export type InactivityAction = "none" | "warn" | "remove";

/** Real days since the manager last opened the world: warn once at `WARN_DAYS`, remove at `INACTIVE_DAYS`. */
export function inactivityAction(lastSeenAt: string | null, warnedAt: string | null, nowMs: number): InactivityAction {
  if (!lastSeenAt) return "none";
  const days = (nowMs - Date.parse(lastSeenAt)) / DAY_MS;
  if (days >= PUBLIC_WORLD.INACTIVE_DAYS) return "remove";
  if (days >= PUBLIC_WORLD.WARN_DAYS && !(warnedAt && warnedAt > lastSeenAt)) return "warn";
  return "none";
}

export function isPublicLeague(slug: string): boolean {
  return (PUBLIC_WORLD.LEAGUES as readonly string[]).includes(slug);
}

export function isPublicWorld(meta: { mode?: string; world?: { kind?: string } | null }): boolean {
  return meta.mode === "multi" && meta.world?.kind === "public";
}
