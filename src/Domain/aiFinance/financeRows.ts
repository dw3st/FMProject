import { aiClubFinance, popularityOf, squadWageBill, tierIndex, type HiringState } from "@/Domain/aiFinance/aiClubFinance";
import type { FinancialTier, Squad } from "@/types/playerTypes";

/**
 * One row of the league "Finances" view (`GET /api/saves/:id/leagues/:slug/ai-finances`).
 * AI-only fields are null on the human club's row: it runs the full financial system instead.
 */
export interface ClubFinanceRow {
  squadId: string;
  name: string;
  slug?: string;
  colors: [string, string];
  isPlayerClub: boolean;
  popularity: number;
  wageBill: number;
  tier: FinancialTier | null;
  weeklyBudget: number | null;
  maxWageBudget: number | null;
  hiring: HiringState | null;
  transferBudget: number | null;
  seasonalTransferBudget: number | null;
}

/** Rows for a league's clubs, strongest first (tier, then popularity, then name). Pure. */
export function buildClubFinanceRows(squads: Squad[], playerClubId: string | null | undefined): ClubFinanceRow[] {
  const rows = squads.map((s): ClubFinanceRow => {
    const base = { squadId: s.id, name: s.name, slug: s.slug, colors: s.colors };
    if (s.id === playerClubId) {
      return {
        ...base, isPlayerClub: true, popularity: popularityOf(s), wageBill: squadWageBill(s),
        tier: null, weeklyBudget: null, maxWageBudget: null, hiring: null, transferBudget: null, seasonalTransferBudget: null,
      };
    }
    const f = aiClubFinance(s);
    return {
      ...base, isPlayerClub: false, popularity: f.popularity, wageBill: f.wageBill, tier: f.tier,
      weeklyBudget: f.weeklyBudget, maxWageBudget: f.maxWageBudget, hiring: f.hiring,
      transferBudget: f.transferBudget, seasonalTransferBudget: f.seasonalTransferBudget,
    };
  });
  const rank = (r: ClubFinanceRow) => (r.tier ? tierIndex(r.tier) : -1);
  return rows.sort((a, b) => rank(b) - rank(a) || b.popularity - a.popularity || a.name.localeCompare(b.name));
}
