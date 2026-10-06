import { addDays, daysBetween } from "@/Domain/dates";
import { WINDOWS } from "@/Domain/market/windowConfig";

/**
 * Transfer windows (`.claude/rules/game/transfer-windows.md`). Pure: nothing is stored, every
 * window is derived from the season dates of the country's tier-1 league.
 */

export interface TransferWindow {
  kind: "pre" | "mid";
  /** First and last open day (inclusive). */
  open: string;
  close: string;
}

/** Season dates of a league (`LeagueSeasonState.start/end`). */
export interface SeasonDates {
  start: string;
  end: string;
}

const shiftYears = (date: string, years: number): string => {
  const y = parseInt(date.slice(0, 4), 10) + years;
  const md = date.slice(5);
  // 29/02 of a non-leap year → 28/02.
  if (md === "02-29" && !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) return `${y}-02-28`;
  return `${y}-${md}`;
};

/** The mid-season window: 31 days from the 1st of the month holding the mid point (next month after the 15th). */
export function midWindow(season: SeasonDates): TransferWindow {
  const mid = addDays(season.start, Math.floor(daysBetween(season.start, season.end) / 2));
  let y = parseInt(mid.slice(0, 4), 10);
  let m = parseInt(mid.slice(5, 7), 10);
  if (parseInt(mid.slice(8, 10), 10) > WINDOWS.MID_LATE_DAY) {
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  const open = `${y}-${String(m).padStart(2, "0")}-01`;
  return { kind: "mid", open, close: addDays(open, WINDOWS.MID_LENGTH - 1) };
}

/**
 * The two windows of one season: pre-season (previous end + 14 → start + 16; the previous season
 * is the same calendar one year earlier) and the mid-season one.
 */
export function seasonWindows(season: SeasonDates): TransferWindow[] {
  const prevEnd = shiftYears(season.end, -1);
  return [
    { kind: "pre", open: addDays(prevEnd, WINDOWS.PRE_OPEN_AFTER_END), close: addDays(season.start, WINDOWS.PRE_CLOSE_AFTER_START) },
    midWindow(season),
  ];
}

/** Windows of the season around `season` (one year back and two ahead), sorted by open date. */
function windowsAround(season: SeasonDates): TransferWindow[] {
  const out: TransferWindow[] = [];
  for (const k of [-1, 0, 1, 2]) {
    out.push(...seasonWindows({ start: shiftYears(season.start, k), end: shiftYears(season.end, k) }));
  }
  return out.sort((a, b) => (a.open < b.open ? -1 : a.open > b.open ? 1 : 0));
}

export interface WindowStatus {
  open: boolean;
  /** Open: the window's last day. */
  until?: string;
  /** Closed: the next window's first day. */
  opensOn?: string;
  /** The window open today, if any. */
  current?: TransferWindow;
  /** The next window to open after today (never the current one). */
  next?: TransferWindow;
}

/** Is a window open on `date`, until when / when does the next one open. */
export function windowStatus(season: SeasonDates, date: string): WindowStatus {
  const all = windowsAround(season);
  const current = all.find((w) => w.open <= date && date <= w.close);
  const next = all.find((w) => w.open > date);
  return current
    ? { open: true, until: current.close, current, ...(next ? { next } : {}) }
    : { open: false, ...(next ? { opensOn: next.open, next } : {}) };
}

export function isWindowOpen(season: SeasonDates, date: string): boolean {
  return windowStatus(season, date).open;
}

/** D1: a new career's club trades for ARRIVAL_GRACE_DAYS from the career start. */
function inArrivalGrace(careerStart: string | undefined, date: string): boolean {
  return !!careerStart && date >= careerStart && date < addDays(careerStart, WINDOWS.ARRIVAL_GRACE_DAYS);
}

/** Status of the human club: its country's window, opened by the arrival grace. */
export function humanWindowStatus(season: SeasonDates | null, date: string, careerStart?: string): WindowStatus {
  const base: WindowStatus = season ? windowStatus(season, date) : { open: true };
  if (base.open || !inArrivalGrace(careerStart, date)) return base;
  const graceEnd = addDays(careerStart!, WINDOWS.ARRIVAL_GRACE_DAYS - 1);
  return { ...base, open: true, until: graceEnd };
}

/** Days until the open window closes (0 on its last day), or null when closed. */
export function daysToClose(status: WindowStatus, date: string): number | null {
  return status.open && status.until ? daysBetween(date, status.until) : null;
}

/** Inside the last DEADLINE_DAYS of the window. */
export function isDeadlineRush(status: WindowStatus, date: string): boolean {
  const d = daysToClose(status, date);
  return d !== null && d < WINDOWS.DEADLINE_DAYS;
}
