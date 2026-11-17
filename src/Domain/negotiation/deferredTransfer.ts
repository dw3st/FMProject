import type { DeferredTransfer } from "@/types/transferMarketTypes";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

/**
 * Fee transfers agreed with the buyer's window closed (tester report 0a35192c): the fee is paid at
 * agreement, the player stays at his club and joins the human club when its window opens.
 */
export const DEFERRED_TRANSFER = {
  /** Pending deferred signings a seat may have at once. */
  MAX_PENDING: 5,
} as const;

/** The deferred signings of a club that have not joined yet. */
export function pendingDeferred(list: readonly DeferredTransfer[] | undefined, clubId: string): DeferredTransfer[] {
  return (list ?? []).filter((d) => d.toClubId === clubId);
}

/** The deferred signings due on `date` (their window opened). */
export function dueDeferred(list: readonly DeferredTransfer[] | undefined, date: string): DeferredTransfer[] {
  return (list ?? []).filter((d) => d.joinsOn <= date);
}

/**
 * Why a new deferred signing is refused at agreement, or null: `deferredLimit` (MAX_PENDING already
 * waiting), `alreadyDeferred` (this player is already coming), `noWindow` (no next opening known).
 */
export function deferredRefusal(args: {
  pending: readonly DeferredTransfer[];
  playerId: string;
  joinsOn: string | undefined;
}): "deferredLimit" | "alreadyDeferred" | "noWindow" | null {
  if (!args.joinsOn) return "noWindow";
  if (args.pending.some((d) => d.playerId === args.playerId)) return "alreadyDeferred";
  if (args.pending.length >= DEFERRED_TRANSFER.MAX_PENDING) return "deferredLimit";
  return null;
}

/**
 * The buyer as the limits see it: its squad plus the players already coming (stubs, only the id is
 * read). The squad cap and the top-25 limit count them as arrived.
 */
export function withPendingArrivals<S extends Pick<Squad, "players">>(buyer: S, pending: readonly DeferredTransfer[]): S {
  if (pending.length === 0) return buyer;
  const have = new Set(buyer.players.map((p) => p.id));
  const stubs = pending.filter((d) => !have.has(d.playerId)).map((d) => ({ id: d.playerId }) as RosterPlayer);
  return { ...buyer, players: [...buyer.players, ...stubs] };
}

/** The seller's squad with the player marked as sold to `buyerId` (`RosterPlayer.deferredTo`), or unmarked with null. */
export function markDeferred(squad: Squad, playerId: string, buyerId: string | null): Squad {
  return {
    ...squad,
    players: squad.players.map((p) => {
      if (p.id !== playerId) return p;
      if (buyerId) return { ...p, deferredTo: buyerId };
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { deferredTo: _gone, ...rest } = p;
      return rest;
    }),
  };
}

/** True when a human club other than `clubId` already bought this player (he is committed). */
export function committedElsewhere(player: Pick<RosterPlayer, "deferredTo">, clubId: string): boolean {
  return !!player.deferredTo && player.deferredTo !== clubId;
}
