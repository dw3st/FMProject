import type { BetGame } from "@/types/betTypes";

/**
 * Friends' games first in the bets list (tester request): a game where either side is the club of another
 * human of the world. The manager's own club never counts as a friend's, even though it is a human club.
 */

/** The nickname of the friend on each side of the game, if any. */
export function friendSidesOf(game: BetGame, humanClubs: ReadonlyMap<string, string>): { home?: string; away?: string } {
  const out: { home?: string; away?: string } = {};
  const home = game.own === "home" ? undefined : humanClubs.get(game.home);
  const away = game.own === "away" ? undefined : humanClubs.get(game.away);
  if (home) out.home = home;
  if (away) out.away = away;
  return out;
}

export function isFriendGame(game: BetGame, humanClubs: ReadonlyMap<string, string>): boolean {
  const s = friendSidesOf(game, humanClubs);
  return s.home !== undefined || s.away !== undefined;
}

/** The friends' games and the rest, each in the order given (stable). */
export function splitFriendGames(games: readonly BetGame[], humanClubs: ReadonlyMap<string, string>): { friends: BetGame[]; rest: BetGame[] } {
  const friends: BetGame[] = [];
  const rest: BetGame[] = [];
  for (const g of games) (isFriendGame(g, humanClubs) ? friends : rest).push(g);
  return { friends, rest };
}
