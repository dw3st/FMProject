import { NEGOTIATION } from "@/Domain/negotiation/negotiationConfig";
import { roundFeeUp } from "@/Domain/negotiation/negotiation";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";
import { feeForSaleScore, humanBuyBlocked, saleContext } from "@/Domain/transfer/transferAcceptance";
import type { Squad } from "@/types/playerTypes";
import type { SellCandidate } from "@/types/transferMarketTypes";

/**
 * What each listed player's club asks to sell him (tester report: the scout search shows the price that closes
 * the deal). An AI club: the smallest fee it accepts from the buyer (`respondToOffer`, no sell-on clause), on the
 * real player, never the blurred row. Another manager's list: his asking price, else the market value. EUR.
 */
export function askingPricesOf(args: {
  squads: Squad[];
  /** AI sell lists, by club id (`MarketState.profiles`). */
  aiLists: Record<string, { sellList?: SellCandidate[] }>;
  /** Other seats' lists, with their club id. */
  seatLists: { clubId: string; list: SellCandidate[] }[];
  buyer: Squad | null;
  humanClubIds: Set<string>;
}): Map<string, number> {
  const byId = new Map(args.squads.map((s) => [s.id, s]));
  const out = new Map<string, number>();
  for (const [clubId, profile] of Object.entries(args.aiLists)) {
    const squad = byId.get(clubId);
    if (!squad || args.humanClubIds.has(clubId) || squad.id === args.buyer?.id) continue;
    for (const c of profile.sellList ?? []) {
      const player = squad.players.find((p) => p.id === c.playerId);
      if (!player || player.loan || humanBuyBlocked(player, squad)) continue;
      const ctx = saleContext(player, squad, c.priority, args.buyer ? { buyer: args.buyer } : {});
      const star = ctx.relativeStrength > NEGOTIATION.STAR_GAP ? ctx.value * NEGOTIATION.STAR_MIN_OFFER : 0;
      const fee = Math.max(feeForSaleScore(ctx, NEGOTIATION.ACCEPT_SCORE), star, ctx.value * NEGOTIATION.LOWBALL_RATIO);
      out.set(player.id, roundFeeUp(fee));
    }
  }
  for (const { clubId, list } of args.seatLists) {
    const squad = byId.get(clubId);
    if (!squad || squad.id === args.buyer?.id) continue;
    for (const c of list) {
      const player = squad.players.find((p) => p.id === c.playerId);
      if (!player || player.loan) continue;
      out.set(player.id, roundFeeUp(c.askingPrice ?? playerMarketValue(player)));
    }
  }
  return out;
}
