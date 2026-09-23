import type { Fixture } from "@/types/calendarTypes";

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Returns ISO dates to seed as rest days: the day before and after
 * each unique match date, as long as that day is not itself a match day.
 */
export function generateRestDays(fixtures: Fixture[]): string[] {
  const matchDates = new Set(fixtures.map((f) => f.date));
  const restSet = new Set<string>();
  for (const date of matchDates) {
    const before = addDays(date, -1);
    const after = addDays(date, +1);
    if (!matchDates.has(before)) restSet.add(before);
    if (!matchDates.has(after)) restSet.add(after);
  }
  return Array.from(restSet).sort();
}
