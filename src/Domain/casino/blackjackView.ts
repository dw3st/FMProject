import { handTotal, legalActions, type BlackjackRound, type BlackjackSettlement } from "@/Domain/casino/blackjack";
import type { BlackjackView } from "@/types/casinoTypes";

/** What the screen sees: no shoe; the dealer's hole card only once the round is settled. */
export function blackjackView(r: BlackjackRound, result: BlackjackSettlement | null): BlackjackView {
  const dealer = result ? r.dealer : r.dealer.slice(0, 1);
  return {
    roundId: r.id,
    dealer,
    dealerTotal: result ? handTotal(r.dealer).total : null,
    hands: r.hands.map((h) => ({ cards: h.cards, stake: h.stake, ...handTotal(h.cards), done: h.done, doubled: h.doubled })),
    active: r.active,
    actions: result ? [] : legalActions(r),
    result,
  };
}
