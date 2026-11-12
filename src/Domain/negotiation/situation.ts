import { suggestedStatuses } from "@/Domain/morale/morale";
import type { SquadStatus } from "@/types/moraleTypes";
import type { MainRole } from "@/Domain/roles";
import type { PlayerArrival, RosterPlayer, Squad } from "@/types/playerTypes";

/** Where a player stands at his club, shown next to an offer: how much he matters, and whether he can leave. */
export interface PlayerSituation {
  role: SquadStatus;
  forSale: boolean;
  /** Listed for loan by a human manager, or an AI club that would lend him. */
  loanable: boolean;
  /** He asked to leave (only the human club's own player). */
  requested?: true;
  onLoan?: true;
  /** His own manager's player: the line his sale would leave below its minimum (a warning, 8.9.8). */
  thinAfter?: { line: MainRole; left: number; min: number };
  /** His own manager's player: how he came to this club and what was paid (absent when the game never recorded it). */
  paid?: { kind: PlayerArrival["kind"]; fee: number; on: string };
  /** His own manager's player: the market value today (EUR). */
  value?: number;
}

/** How a player came to `squadId` and the fee paid, from his arrival record; null when it is of another club or absent. */
export function paidFor(player: RosterPlayer, squadId: string): PlayerSituation["paid"] | null {
  const a = player.arrival;
  if (!a || a.squadId !== squadId) return null;
  return { kind: a.kind, fee: Math.max(0, a.fee ?? 0), on: a.on };
}

export function playerSituation(player: RosterPlayer, squad: Squad, lists: { forSale: boolean; loanable: boolean; requested?: boolean; ownRole?: SquadStatus; thinAfter?: PlayerSituation["thinAfter"] | null; paid?: PlayerSituation["paid"] | null; value?: number }): PlayerSituation {
  return {
    role: lists.ownRole ?? suggestedStatuses(squad)[player.id] ?? "backup",
    forSale: lists.forSale,
    loanable: lists.loanable && !player.loan,
    ...(lists.requested ? { requested: true as const } : {}),
    ...(player.loan ? { onLoan: true as const } : {}),
    ...(lists.thinAfter ? { thinAfter: lists.thinAfter } : {}),
    ...(lists.paid ? { paid: lists.paid } : {}),
    ...(lists.value !== undefined ? { value: lists.value } : {}),
  };
}
