import { addDays } from "@/Domain/dates";
import { ICC } from "@/Domain/intercontinental/iccConfig";

const weekday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Greedy: the earliest `count` days among `days` (ascending), each at least `gap` days after the previous one. */
function greedy(days: string[], count: number, gap: number): string[] {
  const out: string[] = [];
  for (const d of days) {
    if (out.length > 0 && d < addDays(out[out.length - 1]!, gap)) continue;
    out.push(d);
    if (out.length === count) break;
  }
  return out;
}

/**
 * The Intercontinental Cup dates (`ICC.DATES`), strictly after `after` (the generation day). Wednesdays and Saturdays
 * of December first, never on a `busy` day (a match of a participant) nor a `blocked` one (FIFA days of their
 * countries). Without enough of them: any free day of December, then of January; at the very last, Wednesdays and
 * Saturdays ignoring `busy` (never `blocked`).
 */
export function iccDates(args: { after: string; busy: ReadonlySet<string>; blocked: ReadonlySet<string> }): string[] {
  const year = args.after.slice(0, 4);
  const until = (end: string) => {
    const days: string[] = [];
    for (let d = addDays(args.after, 1); d <= end; d = addDays(d, 1)) days.push(d);
    return days;
  };
  const december = until(`${year}-12-31`);
  const january = until(`${Number(year) + 1}-01-31`);
  const free = (d: string) => !args.busy.has(d) && !args.blocked.has(d);
  const wedSat = (d: string) => ICC.WEEKDAYS.includes(weekday(d));
  const attempts: string[][] = [
    december.filter((d) => free(d) && wedSat(d)),
    december.filter(free),
    january.filter(free),
    january.filter((d) => !args.blocked.has(d) && wedSat(d)),
  ];
  for (const days of attempts) {
    const picked = greedy(days, ICC.DATES, ICC.MIN_GAP_DAYS);
    if (picked.length === ICC.DATES) return picked;
  }
  return greedy(january, ICC.DATES, ICC.MIN_GAP_DAYS);
}
