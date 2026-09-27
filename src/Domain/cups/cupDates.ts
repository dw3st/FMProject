import { spreadOnWeekday } from "@/Domain/calendar/spreadDates";

const DAY = 86_400_000;
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const WEDNESDAY = 3;
const FINAL_BEFORE_END_DAYS = 7;
const MIN_GAP_DAYS = 3;

/**
 * Dates for `stages` cup stages inside [start, end − 7d]: spread evenly, snapped to a Wednesday
 * with no league game that day or the day before (`busy` = dates any club of the country plays
 * a league game).
 */
export function scheduleStageDates(start: string, end: string, stages: number, busy: Set<string>): string[] {
  const lo = toMs(start);
  const hi = toMs(end) - FINAL_BEFORE_END_DAYS * DAY;
  // scheduleStageDates blocks a busy date AND the day after it; spreadOnWeekday only checks the
  // exact date, so pre-expand busy with each date's following day before delegating.
  const expandedBusy = new Set<string>();
  for (const d of busy) {
    expandedBusy.add(d);
    expandedBusy.add(toIso(toMs(d) + DAY));
  }
  return spreadOnWeekday(lo, hi, stages, WEDNESDAY, expandedBusy, MIN_GAP_DAYS);
}
