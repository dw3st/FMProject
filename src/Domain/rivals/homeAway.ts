import type { LiveBase } from "@/types/rivalsTypes";

/**
 * A friend's live game in home / away order (the live score is kept from his side: for / against). `aggregate` is the
 * tie's running total (first leg + today) in the same order, or null in a single game.
 */
export function homeAwayOf(l: LiveBase & { score: { for: number; against: number } }) {
  const a = l.aggregate;
  const agg = a ? { for: a.for + l.score.for, against: a.against + l.score.against } : null;
  return l.home
    ? { homeId: l.clubId, homeName: l.clubName, awayId: l.opponentId, awayName: l.opponentName, home: l.score.for, away: l.score.against,
        aggregate: agg ? { home: agg.for, away: agg.against } : null }
    : { homeId: l.opponentId, homeName: l.opponentName, awayId: l.clubId, awayName: l.clubName, home: l.score.against, away: l.score.for,
        aggregate: agg ? { home: agg.against, away: agg.for } : null };
}
