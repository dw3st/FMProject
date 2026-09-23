import type { Squad, RosterPlayer } from "@/types/playerTypes";
import { Player } from "@/Domain/Player";

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
 *
 * Returns a stable `reason` code that the UI maps to a translated string.
 */
export function evaluateTransferOffer(
  player: RosterPlayer,
  fromSquad: Squad,
  fee: number,
  sellPriority?: number,
): { accepted: boolean; reason: TransferRejectReason | TransferAcceptReason } {
  if (fromSquad.players.length <= 14) {
    return { accepted: false, reason: "squadDepth" };
  }

  const posCount = fromSquad.players.filter((p) =>
    p.positions.some((pos) => player.positions.includes(pos)),
  ).length;
  if (posCount <= 1) {
    return { accepted: false, reason: "squadDepth" };
  }

  const pRating = playerOverallRating(player);
  const teamAvg = teamAvgRating(fromSquad);
  const relativeStrength = pRating - teamAvg;

  const expectedValue = new Player(pRating, player.age).price;
  const offerScore = fee / expectedValue;

  const aiBalance = fromSquad.finances?.budget ?? 0;
  const financialPressure =
    aiBalance < 10_000_000 ? 1.0 : aiBalance < 50_000_000 ? 0.5 : 0.1;

  let decisionScore = offerScore * 0.6 + financialPressure * 0.3 - relativeStrength * 0.5;

  if (sellPriority != null && sellPriority > 0) {
    decisionScore += sellPriority * 0.5;
  }

  if (decisionScore > 0.8) {
    const reason: TransferAcceptReason =
      offerScore >= 1.2
        ? "strongOffer"
        : sellPriority != null && sellPriority > 0
          ? "willingToSell"
          : "financial";
    return { accepted: true, reason };
  }

  if (relativeStrength > 0.5) return { accepted: false, reason: "playerImportant" };
  if (offerScore < 0.8) return { accepted: false, reason: "offerTooLow" };
  return { accepted: false, reason: "clubRejected" };
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
): { selling: Squad; buying: Squad } {
  const updatedPlayer: RosterPlayer = { ...player, squadId: buyerSquadId };
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
