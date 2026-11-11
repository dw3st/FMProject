import { saveService } from "@/backend/SaveService";
import { dropFromLineup, marketWithoutPlayer } from "@/backend/negotiationWorld";
import { closeOffersForPlayer } from "@/backend/seatOfferWorld";
import { toFreeAgent } from "@/Domain/contracts/freeAgents";
import { stripPlayerMorale } from "@/Domain/morale/morale";
import type { RosterPlayer } from "@/types/playerTypes";

/**
 * A player of the seat's club leaves as a free agent (friendly termination, or a contract broken after a bad talk,
 * 10.0): out of the squad, into the free pool, off the market lists, open offers closed, out of the line-up. The
 * squad without him must already be saved by the caller.
 */
export async function releaseToFreePool(saveId: string, seatId: string, player: RosterPlayer, date: string): Promise<void> {
  const free = await saveService.getFreeAgents(saveId);
  await saveService.writeFreeAgents(saveId, [...free.filter((f) => f.player.id !== player.id), toFreeAgent(stripPlayerMorale(player), date)]);
  const market = await saveService.getMarket(saveId, seatId);
  if (market) await saveService.saveMarket(saveId, marketWithoutPlayer(market, player.id), seatId);
  await saveService.writeSeatOffers(saveId, await closeOffersForPlayer(saveService, saveId, await saveService.getSeatOffers(saveId), player.id, date));
  await dropFromLineup(saveService, saveId, seatId, player.id);
}
