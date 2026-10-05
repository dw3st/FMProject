import { closePartialSeason } from "@/Domain/history/history";
import { MIN_BY_ROLE, roleOf } from "@/Domain/contracts/freeAgents";
import type { Squad, RosterPlayer, PlayerContract, SellOnClause } from "@/types/playerTypes";
import { Player } from "@/Domain/Player";
import { aiFinancialPressure } from "@/Domain/aiFinance/aiClubFinance";

function playerOverallRating(player: RosterPlayer): number {
  return Player.overallAvg(player);
}

function teamAvgRating(squad: Squad): number {
  if (squad.players.length === 0) return 5;
  const sum = squad.players.reduce((s, p) => s + playerOverallRating(p), 0);
  return sum / squad.players.length;
}

/**
 * Stable reason codes returned by `evaluateTransferOffer`. The UI translates these
 * through i18n keys `transfers.rejectReasons.<code>` / `transfers.acceptReasons.<code>`.
 */
export type TransferRejectReason =
  | "squadDepth"
  | "playerImportant"
  | "offerTooLow"
  | "clubRejected";

export type TransferAcceptReason =
  | "strongOffer"
  | "willingToSell"
  | "financial";

/**
 * Selling-club AI: accept or reject a bid based on squad depth, player importance, fee vs expected value, and finances.
 * `sellPriority` (0–1) — pass from the seller's sell list to boost acceptance for listed players.
 * `opts.humanSeller` — the seller is the human club (financial pressure from its real budget).
 *
 * Returns a stable `reason` code that the UI maps to a translated string.
 */
export function evaluateTransferOffer(
  player: RosterPlayer,
  fromSquad: Squad,
  fee: number,
  sellPriority?: number,
  opts: { humanSeller?: boolean } = {},
): { accepted: boolean; reason: TransferRejectReason | TransferAcceptReason } {
  if (squadDepthBlocked(player, fromSquad, !!opts.humanSeller)) {
    return { accepted: false, reason: "squadDepth" };
  }

  const ctx = saleContext(player, fromSquad, sellPriority, opts);
  const offerScore = fee / ctx.value;
  const decisionScore = saleDecisionScore(ctx, fee);

  if (decisionScore > 0.8) {
    const reason: TransferAcceptReason =
      offerScore >= 1.2
        ? "strongOffer"
        : sellPriority != null && sellPriority > 0
          ? "willingToSell"
          : "financial";
    return { accepted: true, reason };
  }

  if (ctx.relativeStrength > 0.5) return { accepted: false, reason: "playerImportant" };
  if (offerScore < 0.8) return { accepted: false, reason: "offerTooLow" };
  return { accepted: false, reason: "clubRejected" };
}

/**
 * The hard rules a seller never breaks: squad of 15+, another player at the position, and (AI
 * sellers) the per-role minimums after the sale.
 */
export function squadDepthBlocked(player: RosterPlayer, fromSquad: Squad, humanSeller: boolean): boolean {
  if (fromSquad.players.length <= 14) return true;
  const posCount = fromSquad.players.filter((p) =>
    p.positions.some((pos) => player.positions.includes(pos)),
  ).length;
  if (posCount <= 1) return true;
  if (!humanSeller) {
    const role = roleOf(player);
    const inRole = fromSquad.players.filter((p) => roleOf(p) === role).length;
    if (inRole - 1 < MIN_BY_ROLE[role]) return true;
  }
  return false;
}

/** Everything of the seller's decision that does not depend on the fee. */
export interface SaleContext {
  /** Fair price (`Player.price`). */
  value: number;
  relativeStrength: number;
  financialPressure: number;
  /** `sellPriority × 0.5` when the player is on the seller's list. */
  priorityBonus: number;
}

export function saleContext(
  player: RosterPlayer,
  fromSquad: Squad,
  sellPriority?: number,
  opts: { humanSeller?: boolean } = {},
): SaleContext {
  const pRating = playerOverallRating(player);
  const relativeStrength = pRating - teamAvgRating(fromSquad);
  const value = new Player(pRating, player.age).price;
  // AI sellers: pressure from their financial tier (they keep no balance). The human club's
  // listed players are evaluated on its real budget.
  let financialPressure: number;
  if (opts.humanSeller) {
    const balance = fromSquad.finances?.budget ?? 0;
    financialPressure = balance < 10_000_000 ? 1.0 : balance < 50_000_000 ? 0.5 : 0.1;
  } else {
    financialPressure = aiFinancialPressure(fromSquad);
  }
  const priorityBonus = sellPriority != null && sellPriority > 0 ? sellPriority * 0.5 : 0;
  return { value: Math.max(1, value), relativeStrength, financialPressure, priorityBonus };
}

/** `offerScore × 0,6 + pressão × 0,3 − força relativa × 0,5 + lista de venda`. */
export function saleDecisionScore(ctx: SaleContext, fee: number): number {
  return (fee / ctx.value) * 0.6 + ctx.financialPressure * 0.3 - ctx.relativeStrength * 0.5 + ctx.priorityBonus;
}

/** Inverse of `saleDecisionScore`: the (effective) fee that reaches `score`. */
export function feeForSaleScore(ctx: SaleContext, score: number): number {
  return ((score - ctx.financialPressure * 0.3 + ctx.relativeStrength * 0.5 - ctx.priorityBonus) * ctx.value) / 0.6;
}

/**
 * Move the player between squads after an accepted transfer.
 * Money exchange is handled separately by FinancialService.executeTransferFee.
 */
export function squadsAfterAcceptedTransfer(
  player: RosterPlayer,
  sellingSquad: Squad,
  buyingSquad: Squad,
  buyerSquadId: string,
  playerId: string,
  /** The new club's contract for the player (every signing creates one). */
  contract?: PlayerContract,
  /** Selling club's league + season label: closes a partial history row (`.claude/rules/game/history.md`). */
  from?: { league: string; season: string } | null,
  /**
   * Sell-on clause the SELLING club keeps on this sale (`.claude/rules/game/negotiation.md`). Any
   * previous clause is dropped here: the caller has already paid it out of this fee.
   */
  sellOn?: SellOnClause | null,
): { selling: Squad; buying: Squad } {
  const closed = from
    ? closePartialSeason(player, { squadId: sellingSquad.id, clubName: sellingSquad.name, league: from.league }, from.season)
    : player;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { sellOn: _paid, loan: _loan, ...rest } = closed;
  const updatedPlayer: RosterPlayer = {
    ...rest, squadId: buyerSquadId, ...(contract ? { contract } : {}), ...(sellOn ? { sellOn } : {}),
  };
  return {
    selling: {
      ...sellingSquad,
      players: sellingSquad.players.filter((p) => p.id !== playerId),
    },
    buying: {
      ...buyingSquad,
      players: [...buyingSquad.players, updatedPlayer],
    },
  };
}
