import { describe, expect, test } from "bun:test";
import { BETS } from "@/Domain/bets/betsConfig";
import { buildMarkets, oddsFromProb, onlyForOwnClub, scoreGrid, scorerShares } from "@/Domain/bets/odds";

const scorers = [
  { playerId: "h9", playerName: "H", side: "home" as const, share: 0.5 },
  { playerId: "a9", playerName: "A", side: "away" as const, share: 0.5 },
];

describe("bet odds", () => {
  test("the score grid sums to one", () => {
    const sum = scoreGrid(1.6, 1.1).flat().reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 6);
  });

  test("the house margin is in every result price", () => {
    const m = buildMarkets({ xgHome: 1.5, xgAway: 1.2, scorers });
    const implied = m.result.reduce((a, r) => a + 1 / r.odds, 0);
    expect(implied).toBeCloseTo(1 + BETS.MARGIN, 1);
  });

  test("the favourite pays less, and odds stay in range", () => {
    const m = buildMarkets({ xgHome: 2.4, xgAway: 0.6, scorers });
    expect(m.result[0]!.odds).toBeLessThan(m.result[2]!.odds);
    expect(oddsFromProb(0)).toBe(BETS.MAX_ODDS);
    expect(oddsFromProb(1)).toBe(BETS.MIN_ODDS);
  });

  test("the own club keeps only what backs it", () => {
    const m = buildMarkets({ xgHome: 1.5, xgAway: 1.2, scorers });
    const own = onlyForOwnClub(m, "away");
    expect(own.result.map((r) => r.side)).toEqual(["away"]);
    expect(own.scores.length).toBeGreaterThan(0);
    expect(own.scores.every((s) => s.away > s.home)).toBe(true);
    expect(own.scorers.every((s) => s.side === "away")).toBe(true);
    expect(onlyForOwnClub(m, null)).toEqual(m);
  });

  test("shares follow the goal weight and sum to one per side", () => {
    const s = scorerShares([
      { playerId: "st", playerName: "ST", side: "home", group: "FWD", finishing: 8 },
      { playerId: "cm", playerName: "CM", side: "home", group: "MID", finishing: 6 },
      { playerId: "cb", playerName: "CB", side: "home", group: "DEF", finishing: 3 },
    ]);
    expect(s.map((x) => x.playerId)).toEqual(["st", "cm"]);
    expect(s.reduce((a, x) => a + x.share, 0)).toBeCloseTo(1, 6);
  });
});
