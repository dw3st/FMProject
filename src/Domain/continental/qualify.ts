import type { SlotTable } from "@/Domain/continental/slots";

/** Clubs for the primary and secondary competitions: each country's ranking, primary places first. */
export function pickQualifiers(
  slots: SlotTable,
  rankingByCountry: Record<string, string[]>,
): { primary: string[]; secondary: string[] } {
  const primary: string[] = [];
  const secondary: string[] = [];
  for (const country of Object.keys(slots).sort()) {
    const ranking = rankingByCountry[country] ?? [];
    const { primary: p, secondary: s } = slots[country]!;
    primary.push(...ranking.slice(0, p));
    secondary.push(...ranking.slice(p, p + s));
  }
  return { primary, secondary };
}
