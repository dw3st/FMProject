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
import { applyAITransferSale, applyAITransferSpend } from "@/Domain/aiFinance/aiClubFinance";
import { applyMoney, type LedgerEntry } from "@/Domain/finance/ledger";
import { gateRevenue } from "@/Domain/finance/gate";

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

/** Home matchday ticket revenue based on stadium capacity (league price — see `gateRevenue`). */
export function calcMatchdayRevenue(squad: Squad): number {
  const capacity = squad.venue?.capacity ?? 0;
  return gateRevenue(capacity, "league");
}

// ── Season start ──────────────────────────────────────────────────────────────

/**
 * The ledger season for the player's club: the `year` of the given league's season meta. Falls
 * back to the calendar year of `fallbackDate` (or now) when the league meta is missing — should
 * not happen for an active save, but keeps this from throwing.
 */
async function ledgerSeasonFor(
  service: SaveService,
  saveId: string,
  leagueSlug: string,
  fallbackDate?: string,
): Promise<number> {
  const lm = await service.getLeagueMeta(saveId, leagueSlug);
  if (lm) return lm.year;
  const d = fallbackDate ? new Date(fallbackDate) : new Date();
  return d.getFullYear();
}

/**
 * Credit the full season broadcasting fee to the player's club budget via the ledger
 * (`recordMoney` — see `.claude/rules/game/finances.md`). Called once when a new save is created.
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

  const season = await ledgerSeasonFor(saveService, saveId, leagueSlug, meta.currentDate);
  await recordMoney(saveService, saveId, season, { leagueSlug, clubSlug }, {
    date: meta.currentDate ?? new Date().toISOString().slice(0, 10),
    kind: "broadcasting",
    amount: broadcasting,
    label: "Broadcasting revenue",
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
 * The human club pays / receives on `finances.budget` (its real balance, no clamp — see
 * `transferFeeSquads`) and gets a `transfer_out`/`transfer_in` ledger entry. AI clubs keep no
 * balance: an AI buyer's fee comes out of its seasonal transfer budget and an AI seller gets part
 * of the fee back into it (`applyAITransferSpend` / `applyAITransferSale`, src/Domain/aiFinance) —
 * no ledger entry, the ledger is the player club's cash extract only.
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

  if (buyer.isPlayerClub || seller.isPlayerClub) {
    const date = meta.currentDate ?? new Date().toISOString().slice(0, 10);
    const playerRef = buyer.isPlayerClub ? buyer : seller;
    const season = await ledgerSeasonFor(service, saveId, playerRef.leagueSlug, date);
    const entries: LedgerEntry[] = [];
    if (buyer.isPlayerClub) {
      entries.push({
        date, kind: "transfer_out", amount: -fee,
        label: `Transfer fee paid to ${seller.squad.name}`,
        ref: { opponentId: seller.squad.id },
      });
    }
    if (seller.isPlayerClub) {
      entries.push({
        date, kind: "transfer_in", amount: fee,
        label: `Transfer fee from ${buyer.squad.name}`,
        ref: { opponentId: buyer.squad.id },
      });
    }
    await service.appendLedger(saveId, season, entries);
  }

  return meta;
}

/**
 * Pure: both squads with the fee applied (see `executeTransferFee`). Always returns both squads,
 * which the caller persists as the final state of the transfer (roster + money). No clamp on the
 * human side — the balance may go negative (design spec §2, "Extrato").
 */
export function transferFeeSquads(
  buyer: Pick<ClubRef, "squad" | "isPlayerClub">,
  seller: Pick<ClubRef, "squad" | "isPlayerClub">,
  fee: number,
): { buyer: Squad; seller: Squad } {
  const humanDelta = (s: Squad, delta: number): Squad =>
    s.finances ? { ...s, finances: { ...s.finances, budget: (s.finances.budget ?? 0) + delta } } : s;
  return {
    buyer: buyer.isPlayerClub ? humanDelta(buyer.squad, -fee) : applyAITransferSpend(buyer.squad, fee),
    seller: seller.isPlayerClub ? humanDelta(seller.squad, fee) : applyAITransferSale(seller.squad, fee),
  };
}

// ── Ledger (player club cash extract) ──────────────────────────────────────────

/** Where a squad lives — the same (league, club stem/id) pair `saveSquad`/`getSquad` resolve. */
export interface SquadRef {
  leagueSlug: string;
  clubSlug: string;
}

/**
 * The single entry point for a money movement on the player's club: reads the squad, applies
 * `entry` to its budget (`applyMoney`, no clamp — the balance may go negative), persists the
 * squad, and appends `entry` to the season's ledger. The ledger's season is the `year` of the
 * player's league season (see `.claude/rules/game/finances.md`).
 *
 * Returns the updated squad so a caller applying several entries in a row (e.g. a Monday's
 * commercial + wages + operational lines) can chain without re-reading.
 */
export async function recordMoney(
  service: SaveService,
  saveId: string,
  season: number,
  squadRef: SquadRef,
  entry: LedgerEntry,
): Promise<Squad> {
  const squad = await service.getSquad(saveId, squadRef.leagueSlug, squadRef.clubSlug);
  if (!squad) {
    throw new Error(`recordMoney: squad ${squadRef.leagueSlug}/${squadRef.clubSlug} not found in save ${saveId}`);
  }
  const updated = applyMoney(squad, entry);
  await service.saveSquad(saveId, squadRef.leagueSlug, squadRef.clubSlug, updated);
  await service.appendLedger(saveId, season, [entry]);
  return updated;
}
