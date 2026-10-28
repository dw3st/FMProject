// A player the human club sold is not sold, lent or pre-signed back to it for a while (tester report): the club
// that bought him refuses, as in real football. Recorded on the player at the sale (`RosterPlayer.formerClub`).
import { addDays } from "@/Domain/dates";
import type { RosterPlayer } from "@/types/playerTypes";

/** Days after the sale during which the former club cannot buy him back. */
export const REBUY_BLOCK_DAYS = 365;

/** The player after a sale by `clubId` on `date`. */
export function withFormerClub<P extends RosterPlayer>(player: P, clubId: string, date: string): P {
  return { ...player, formerClub: { squadId: clubId, until: addDays(date, REBUY_BLOCK_DAYS) } };
}

/** The date the former club can buy him again, or null when it is not blocked. */
export function rebuyBlockedUntil(player: Pick<RosterPlayer, "formerClub">, clubId: string, date: string): string | null {
  const f = player.formerClub;
  return f && f.squadId === clubId && date < f.until ? f.until : null;
}
