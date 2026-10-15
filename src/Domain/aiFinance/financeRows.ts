import { aiClubFinance, popularityOf, squadWageBill, tierIndex, type HiringState } from "@/Domain/aiFinance/aiClubFinance";
import type { FinancialTier, Squad } from "@/types/playerTypes";

/**
 * One row of the league "Finances" view (`GET /api/saves/:id/leagues/:slug/ai-finances`).
 * AI-only fields are null on a human club's row (the viewer's or another seat's): it runs the full financial system.
 */
export interface ClubFinanceRow {
  squadId: string;
  name: string;
  slug?: string;
  colors: [string, string];
  /** The viewer's own club. */
  isPlayerClub: boolean;
  /** Any club with a human manager (`.claude/rules/game/multiplayer.md`), the viewer's included. */
  isHumanClub: boolean;
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
export function buildClubFinanceRows(
  squads: Squad[],
  playerClubId: string | null | undefined,
  /** Every human club of the world (absent = the viewer's only). */
  humanClubIds?: ReadonlySet<string>,
): ClubFinanceRow[] {
  const rows = squads.map((s): ClubFinanceRow => {
    const base = { squadId: s.id, name: s.name, slug: s.slug, colors: s.colors };
    if (s.id === playerClubId || humanClubIds?.has(s.id)) {
      return {
        ...base, isPlayerClub: s.id === playerClubId, isHumanClub: true, popularity: popularityOf(s), wageBill: squadWageBill(s),
        tier: null, weeklyBudget: null, maxWageBudget: null, hiring: null, transferBudget: null, seasonalTransferBudget: null,
      };
    }
    const f = aiClubFinance(s);
    return {
      ...base, isPlayerClub: false, isHumanClub: false, popularity: f.popularity, wageBill: f.wageBill, tier: f.tier,
      weeklyBudget: f.weeklyBudget, maxWageBudget: f.maxWageBudget, hiring: f.hiring,
      transferBudget: f.transferBudget, seasonalTransferBudget: f.seasonalTransferBudget,
    };
  });
  const rank = (r: ClubFinanceRow) => (r.tier ? tierIndex(r.tier) : -1);
  return rows.sort((a, b) => rank(b) - rank(a) || b.popularity - a.popularity || a.name.localeCompare(b.name));
}
