/**
 * FinancialService — central ledger for all in-game money operations.
 *
 * Money sources of truth:
 *   Player's club  → squad.finances.budget  (overall balance)
 *   AI clubs       → squad.aiTransferBudget (seasonal, tier-derived; src/Domain/aiFinance)
 *
 * All monetary mutations go through this module. Never write budget
 * directly from route handlers or domain functions.
 */

import { saveService, SaveService } from "@/backend/SaveService";
import type { SaveMeta } from "@/backend/SaveService";
import type { Squad } from "@/types/playerTypes";
import { applyAITransferSale, applyAITransferSpend, estimateWeeklyWage } from "@/Domain/aiFinance/aiClubFinance";

// ── Constants ─────────────────────────────────────────────────────────────────

export const TICKET_PRICE = 25;
export const HOME_FILL_RATE = 0.65;

// ── Internal helpers ──────────────────────────────────────────────────────────

// ── Balance getters ───────────────────────────────────────────────────────────

/** Club budget from squad.finances (the human club's balance; AI clubs use aiTransferBudget). */
export function getClubBudget(squad: Squad): number {
  return squad.finances?.budget ?? 0;
}

// ── Pure financial calculations (no side effects) ─────────────────────────────

/**
 * Net weekly P/L for a squad:
 *   commercial_income / 52  −  total_weekly_salaries  −  operational (10% of salaries)
 */
export function calcWeeklyDelta(squad: Squad): number {
  const weeklyCommercial = Math.round((squad.finances?.commercial ?? 0) / 52);
  const weeklyPlayerSalary = squad.players.reduce((sum, p) => sum + estimateWeeklyWage(p), 0);
  const weeklyOperational = Math.round(weeklyPlayerSalary * 0.1);
  return weeklyCommercial - weeklyPlayerSalary - weeklyOperational;
}

/** Home matchday ticket revenue based on stadium capacity. */
export function calcMatchdayRevenue(squad: Squad): number {
  const capacity = squad.venue?.capacity ?? 0;
  return capacity > 0 ? Math.round(capacity * HOME_FILL_RATE * TICKET_PRICE) : 0;
}

// ── Season start ──────────────────────────────────────────────────────────────

/**
 * Credit the full season broadcasting fee to the player's club budget.
 * Called once when a new save is created.
 */
export async function applyBroadcasting(
  saveId: string,
  meta: SaveMeta,
  leagueSlug: string,
  clubSlug: string,
): Promise<SaveMeta> {
  const squad = await saveService.getSquad(saveId, leagueSlug, clubSlug);
  const broadcasting = squad?.finances?.broadcasting ?? 0;
  if (broadcasting <= 0 || !squad?.finances) return meta;

  await saveService.saveSquad(saveId, leagueSlug, clubSlug, {
    ...squad,
    finances: {
      ...squad.finances,
      budget: (squad.finances.budget ?? 0) + broadcasting,
    },
  });

  return meta;
}

// ── Transfer fee exchange ─────────────────────────────────────────────────────

type ClubRef = {
  squad: Squad;
  leagueSlug: string;
  clubSlug: string;
  isPlayerClub: boolean;
};

/**
 * Move a transfer fee from the buyer to the seller and persist all changes.
 *
 * The human club pays / receives on `finances.budget` (its real balance). AI clubs keep no balance:
 * an AI buyer's fee comes out of its seasonal transfer budget and an AI seller gets part of the fee
 * back into it (`applyAITransferSpend` / `applyAITransferSale`, src/Domain/aiFinance).
 *
 * Returns the updated SaveMeta.
 */
export async function executeTransferFee(
  saveId: string,
  meta: SaveMeta,
  buyer: ClubRef,
  seller: ClubRef,
  fee: number,
  service: SaveService = saveService,
): Promise<SaveMeta> {
  const { buyer: paid, seller: credited } = transferFeeSquads(buyer, seller, fee);
  await Promise.all([
    service.saveSquad(saveId, buyer.leagueSlug, buyer.clubSlug, paid),
    service.saveSquad(saveId, seller.leagueSlug, seller.clubSlug, credited),
  ]);
  return meta;
}

/**
 * Pure: both squads with the fee applied (see `executeTransferFee`). Always returns both squads,
 * which the caller persists as the final state of the transfer (roster + money).
 */
export function transferFeeSquads(
  buyer: Pick<ClubRef, "squad" | "isPlayerClub">,
  seller: Pick<ClubRef, "squad" | "isPlayerClub">,
  fee: number,
): { buyer: Squad; seller: Squad } {
  const humanDelta = (s: Squad, delta: number): Squad =>
    s.finances ? { ...s, finances: { ...s.finances, budget: Math.max(0, (s.finances.budget ?? 0) + delta) } } : s;
  return {
    buyer: buyer.isPlayerClub ? humanDelta(buyer.squad, -fee) : applyAITransferSpend(buyer.squad, fee),
    seller: seller.isPlayerClub ? humanDelta(seller.squad, fee) : applyAITransferSale(seller.squad, fee),
  };
}
