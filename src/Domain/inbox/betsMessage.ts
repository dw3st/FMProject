import type { Bet } from "@/types/betTypes";
import type { BetsInboxMessage } from "@/types/inboxTypes";

/** The bets resolved today. English fallback; the screen translates. */
export function buildBetsMessage(date: string, bets: Bet[], net: number): BetsInboxMessage {
  return {
    id: `bets-${date}`,
    date,
    createdAt: date,
    read: false,
    category: "bets",
    subject: "Your bets were settled",
    preview: `${bets.length} bets, net ${net}`,
    kind: "settled",
    bets,
    net,
  };
}
