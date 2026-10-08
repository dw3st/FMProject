/**
 * Big-match demand multiplier of a home game of the human club (spec 2026-10-08-match-visual §6):
 * derby ×1,20, national-cup knockout ×1,15, continental knockout ×1,25, combined by product and
 * capped at ×1,30. A group-stage game or an ordinary league game = 1. The AI never uses it.
 */
export const MATCH_IMPORTANCE = { DERBY: 1.2, CUP_KNOCKOUT: 1.15, CONTINENTAL_KNOCKOUT: 1.25, MAX: 1.3 } as const;

export type ImportanceCompetition = "league" | "cup" | "continental";

export function matchImportanceMult(m: { derby: boolean; competition: ImportanceCompetition; knockout: boolean }): number {
  let mult = 1;
  if (m.derby) mult *= MATCH_IMPORTANCE.DERBY;
  if (m.knockout && m.competition === "cup") mult *= MATCH_IMPORTANCE.CUP_KNOCKOUT;
  if (m.knockout && m.competition === "continental") mult *= MATCH_IMPORTANCE.CONTINENTAL_KNOCKOUT;
  return Math.min(MATCH_IMPORTANCE.MAX, mult);
}
