import type { Fixture } from "@/types/calendarTypes";
import { addDays } from "@/Domain/dates";

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
