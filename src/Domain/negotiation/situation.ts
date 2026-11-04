import { suggestedStatuses } from "@/Domain/morale/morale";
import type { SquadStatus } from "@/types/moraleTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

/** Where a player stands at his club, shown next to an offer: how much he matters, and whether he can leave. */
export interface PlayerSituation {
  role: SquadStatus;
  forSale: boolean;
  /** Listed for loan by a human manager, or an AI club that would lend him. */
  loanable: boolean;
  /** He asked to leave (only the human club's own player). */
  requested?: true;
  onLoan?: true;
}

export function playerSituation(player: RosterPlayer, squad: Squad, lists: { forSale: boolean; loanable: boolean; requested?: boolean; ownRole?: SquadStatus }): PlayerSituation {
  return {
    role: lists.ownRole ?? suggestedStatuses(squad)[player.id] ?? "backup",
    forSale: lists.forSale,
    loanable: lists.loanable && !player.loan,
    ...(lists.requested ? { requested: true as const } : {}),
    ...(player.loan ? { onLoan: true as const } : {}),
  };
}
