import { describe, expect, test } from "bun:test";
import { friendSidesOf, isFriendGame, splitFriendGames } from "@/Domain/bets/friendGames";
import type { BetGame } from "@/types/betTypes";

const game = (id: string, home: string, away: string, own: BetGame["own"] = null): BetGame => ({
  competition: "premier_league", fixtureId: id, date: "2027-01-02", home, away, homeName: home, awayName: away, own,
  markets: { result: [], scores: [], scorers: [] },
} as BetGame);

const humans = new Map([["me", "Eu"], ["fab", "Fabio"], ["ana", "Ana"]]);

describe("friend games", () => {
  test("a friend on either side", () => {
    expect(friendSidesOf(game("1", "fab", "x"), humans)).toEqual({ home: "Fabio" });
    expect(friendSidesOf(game("2", "x", "ana"), humans)).toEqual({ away: "Ana" });
    expect(friendSidesOf(game("3", "fab", "ana"), humans)).toEqual({ home: "Fabio", away: "Ana" });
    expect(isFriendGame(game("4", "x", "y"), humans)).toBe(false);
  });

  test("his own club is not a friend's, but his opponent can be", () => {
    expect(isFriendGame(game("5", "me", "x", "home"), humans)).toBe(false);
    expect(friendSidesOf(game("6", "me", "fab", "home"), humans)).toEqual({ away: "Fabio" });
  });

  test("split keeps the order", () => {
    const list = [game("a", "x", "y"), game("b", "fab", "y"), game("c", "z", "w"), game("d", "y", "ana")];
    const { friends, rest } = splitFriendGames(list, humans);
    expect(friends.map((g) => g.fixtureId)).toEqual(["b", "d"]);
    expect(rest.map((g) => g.fixtureId)).toEqual(["a", "c"]);
  });

  test("no humans: nothing moves", () => {
    const list = [game("a", "fab", "y")];
    expect(splitFriendGames(list, new Map()).friends).toEqual([]);
  });
});
