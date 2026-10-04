/** ISO `YYYY-MM-DD` date helpers. All arithmetic is in UTC, so the server's time zone never shifts a day. */

const DAY_MS = 86_400_000;

const utcMidnight = (date: string): number => Date.parse(`${date}T00:00:00Z`);

/** `date` moved by `days` (negative goes back). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The day after `date`. */
export function addOneDay(date: string): string {
  return addDays(date, 1);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / DAY_MS);
}
