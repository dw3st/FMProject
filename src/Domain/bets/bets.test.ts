import { describe, expect, test } from "bun:test";
import { checkBet, maxStake, parsePick, resultOfEvent, settleBets, stepStake } from "@/Domain/bets/bets";
import { BETS } from "@/Domain/bets/betsConfig";
import type { Bet, BetMarkets, BetPick, BetsState } from "@/types/betTypes";

const markets: BetMarkets = {
  result: [{ side: "home", odds: 2 }, { side: "draw", odds: 3.2 }, { side: "away", odds: 3.5 }],
  scores: [{ home: 1, away: 0, odds: 6 }, { home: 0, away: 1, odds: 9 }],
  scorers: [{ playerId: "p9", playerName: "Nove", side: "home", odds: 2.5 }],
};
const bet = (pick: BetPick, over: Partial<Bet> = {}): Bet => ({
  id: "b1", placedOn: "2027-02-10", competition: "liga", fixtureId: "f1", date: "2027-02-13", home: "h", away: "a",
  homeName: "H", awayName: "A", pick, stake: 1000, odds: 2, ...over,
});
const empty: BetsState = { open: [], settled: [] };
const base = { state: empty, game: { competition: "liga", fixtureId: "f1" }, stake: 10_000, clientOdds: 2, wallet: 1_000_000, full: markets, offered: markets };
const homeWin: BetPick = { market: "result", side: "home" };

describe("checkBet", () => {
  test("a good bet gets the price", () => expect(checkBet({ ...base, pick: homeWin })).toEqual({ odds: 2 }));
  test("against the own club", () => {
    const offered = { ...markets, result: [markets.result[0]!] };
    expect(checkBet({ ...base, offered, pick: { market: "result", side: "away" }, clientOdds: 3.5 })).toMatchObject({ status: 403, error: "ownClubAgainst" });
  });
  test("a score nobody offers", () => expect(checkBet({ ...base, pick: { market: "score", home: 7, away: 7 } })).toMatchObject({ status: 400, error: "invalidPick" }));
  test("stake limits", () => {
    expect(checkBet({ ...base, pick: homeWin, stake: 10 })).toMatchObject({ error: "invalidStake" });
    expect(checkBet({ ...base, pick: homeWin, stake: 100_001 })).toMatchObject({ status: 409, error: "noMoney" });
  });
  test("one bet per market in a game", () => {
    expect(checkBet({ ...base, pick: { market: "result", side: "draw" }, clientOdds: 3.2, state: { open: [bet(homeWin)], settled: [] } })).toMatchObject({ error: "alreadyBet" });
    expect(checkBet({ ...base, pick: { market: "score", home: 1, away: 0 }, clientOdds: 6, state: { open: [bet(homeWin)], settled: [] } })).toEqual({ odds: 6 });
  });
  test("too many open", () => {
    const open = Array.from({ length: BETS.MAX_OPEN }, (_, i) => bet(homeWin, { fixtureId: `x${i}` }));
    expect(checkBet({ ...base, pick: homeWin, state: { open, settled: [] } })).toMatchObject({ error: "tooManyBets" });
  });
  test("the price moved", () => expect(checkBet({ ...base, pick: homeWin, clientOdds: 1.9 })).toMatchObject({ status: 409, error: "oddsChanged", odds: 2 }));
});

test("parsePick refuses junk", () => {
  expect(parsePick({ market: "result", side: "home" })).toEqual({ market: "result", side: "home" });
  expect(parsePick({ market: "result", side: "x" })).toBeNull();
  expect(parsePick({ market: "score", home: 1.5, away: 0 })).toBeNull();
  expect(parsePick({ market: "scorer", playerId: "p9" })).toEqual({ market: "scorer", playerId: "p9", playerName: "" });
  expect(parsePick(null)).toBeNull();
});

test("maxStake is 10% of the wallet", () => expect(maxStake(1_234_567)).toBe(123_456));

test("stepStake moves and stays in range", () => {
  expect(stepStake(50_000, 1, 1_000_000)).toBe(60_000);
  expect(stepStake(BETS.MIN_STAKE, -1, 1_000_000)).toBe(BETS.MIN_STAKE);
  expect(stepStake(990_000, 1, 1_000_000)).toBe(1_000_000);
});

describe("settlement", () => {
  const r = { competition: "liga", fixtureId: "f1", home: 1, away: 0, scorers: new Set(["p9"]) };
  test("win, loss, net, exact score", () => {
    const state: BetsState = { open: [
      bet(homeWin, { id: "w", stake: 1000, odds: 2 }),
      bet({ market: "result", side: "draw" }, { id: "l", stake: 500, odds: 3 }),
      bet({ market: "score", home: 1, away: 0 }, { id: "e", stake: 100, odds: 9 }),
      bet({ market: "scorer", playerId: "p9", playerName: "Nove" }, { id: "s", stake: 100, odds: 2.5 }),
    ], settled: [] };
    const out = settleBets(state, [r], "2027-02-13");
    expect(out.state.open).toEqual([]);
    expect(out.settled.map((b) => b.status)).toEqual(["won", "lost", "won", "won"]);
    expect(out.net).toBe(1000 - 500 + 800 + 150);
    expect(out.exact).toBe(1);
    expect(out.longshot).toBe(true);
  });
  test("a bet on another game stays open and running twice changes nothing", () => {
    const state: BetsState = { open: [bet(homeWin, { fixtureId: "other" })], settled: [] };
    const out = settleBets(state, [r], "2027-02-13");
    expect(out.state.open).toHaveLength(1);
    expect(out.net).toBe(0);
    const again = settleBets(settleBets({ open: [bet(homeWin)], settled: [] }, [r], "2027-02-13").state, [r], "2027-02-13");
    expect(again.settled).toEqual([]);
  });
  test("a game that never happens is refunded after 30 days", () => {
    const out = settleBets({ open: [bet(homeWin, { date: "2027-02-13" })], settled: [] }, [], "2027-03-16");
    expect(out.settled[0]!.status).toBe("refunded");
    expect(out.net).toBe(0);
  });
  test("90 minutes: extra-time goals do not count for the score", () => {
    const res = resultOfEvent({ competition: "c", fixtureId: "f", score: { home: 2, away: 1 }, decider: { extraTime: { home: 1, away: 0 } }, scorers: [{ playerId: "p", playerName: "P", team: "home", goals: 1 }] });
    expect([res.home, res.away]).toEqual([1, 1]);
    expect(res.scorers.has("p")).toBe(true);
  });
});
