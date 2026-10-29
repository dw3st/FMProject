import type { MarketBid, NegotiationTalk, RivalBid } from "@/types/transferMarketTypes";
import type { SeatOffer } from "@/types/seatOfferTypes";

/** Players the human club is buying and selling right now (dashboard transfer window strip). */
export interface NegotiationSummary {
  buying: number;
  selling: number;
}

/**
 * Buying: today's open talks (transfer or loan, not closed after a lowball), targets with a live rival bid, and
 * offers to another seat. Selling: live AI bids for the club's players and offers from another seat. Each player
 * counts once per side.
 */
export function negotiationSummary(args: {
  date: string;
  seatId: string;
  talks?: Record<string, NegotiationTalk>;
  rivals?: RivalBid[];
  bids?: MarketBid[];
  seatOffers?: SeatOffer[];
}): NegotiationSummary {
  const { date, seatId } = args;
  const buying = new Set<string>();
  const selling = new Set<string>();
  for (const talk of Object.values(args.talks ?? {})) {
    if (talk.date === date && !(talk.closedUntil && talk.closedUntil >= date)) buying.add(talk.playerId);
  }
  for (const r of args.rivals ?? []) if (r.deadline >= date) buying.add(r.playerId);
  for (const b of args.bids ?? []) selling.add(b.playerId);
  for (const o of args.seatOffers ?? []) {
    if (o.expires < date) continue;
    if (o.buyer.seatId === seatId) buying.add(o.playerId);
    else if (o.seller.seatId === seatId) selling.add(o.playerId);
  }
  return { buying: buying.size, selling: selling.size };
}
