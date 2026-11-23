import type { StandingRow } from "@/types/playerTypes";

/**
 * League table position of each club of a match (tester report: shown next to the crest on the live scoreboard).
 * The table is stored in order; a club missing from it, or before anyone has played, has no position. Pure.
 */
export function tablePositions(table: readonly StandingRow[] | null | undefined, clubIds: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (!table || !table.some((r) => r.mp > 0)) return out;
  for (const id of clubIds) {
    const i = table.findIndex((r) => r.squadId === id);
    if (i >= 0) out[id] = i + 1;
  }
  return out;
}
