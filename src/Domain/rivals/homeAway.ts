import type { LiveBase } from "@/types/rivalsTypes";

/** A friend's live game in home / away order (the live score is kept from his side: for / against). */
export function homeAwayOf(l: LiveBase & { score: { for: number; against: number } }) {
  return l.home
    ? { homeId: l.clubId, homeName: l.clubName, awayId: l.opponentId, awayName: l.opponentName, home: l.score.for, away: l.score.against }
    : { homeId: l.opponentId, homeName: l.opponentName, awayId: l.clubId, awayName: l.clubName, home: l.score.against, away: l.score.for };
}
