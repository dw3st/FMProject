/** Changelog entries by month ("YYYY-MM"), keeping their order: the newest month first. */
export function groupByMonth<T extends { date: string }>(entries: T[]): { month: string; entries: T[] }[] {
  const months: { month: string; entries: T[] }[] = [];
  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const group = months.find((m) => m.month === month);
    if (group) group.entries.push(entry);
    else months.push({ month, entries: [entry] });
  }
  return months;
}
