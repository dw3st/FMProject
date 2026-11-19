import { describe, expect, test } from "bun:test";
import { betStats, oddsBandOf } from "@/Domain/bets/betStats";
import type { Bet, BetPick } from "@/types/betTypes";

let n = 0;
function bet(status: Bet["status"], odds: number, stake: number, date: string, pick: BetPick = { market: "result", side: "home" }): Bet {
  return {
    id: `b${++n}`, placedOn: date, competition: "premier_league", fixtureId: `f${n}`, date, home: "1", away: "2",
    homeName: "A", awayName: "B", pick, stake, odds, status, settledOn: date,
    payout: status === "won" ? Math.round(stake * odds) : status === "refunded" ? stake : 0,
  };
}

describe("oddsBandOf", () => {
  test("puts each price in its band, the upper edge in the next one", () => {
    expect(oddsBandOf(1.05)).toBe("1.01-1.5");
    expect(oddsBandOf(1.5)).toBe("1.5-2");
    expect(oddsBandOf(2.99)).toBe("2-3");
    expect(oddsBandOf(3)).toBe("3-5");
    expect(oddsBandOf(9.5)).toBe("5-10");
    expect(oddsBandOf(10)).toBe("10+");
    expect(oddsBandOf(100)).toBe("10+");
  });
});

describe("betStats", () => {
  test("totals, greens and reds, ROI and hit rate; refunds count apart", () => {
    const s = betStats([
      bet("won", 2, 10_000, "2026-08-20"),
      bet("lost", 3.5, 5_000, "2026-08-20", { market: "score", home: 1, away: 0 }),
      bet("lost", 1.4, 5_000, "2026-08-22"),
      bet("refunded", 1.8, 7_000, "2026-08-22"),
    ]);
    expect(s.totals).toMatchObject({ bets: 3, greens: 1, reds: 2, staked: 20_000, returned: 20_000, profit: 0, refunded: 1 });
    expect(s.totals.roi).toBe(0);
    expect(s.totals.hitRate).toBeCloseTo(1 / 3);
  });

  test("the profit line adds up by game date, oldest first", () => {
    const s = betStats([
      bet("lost", 1.4, 5_000, "2026-08-22"),
      bet("won", 2, 10_000, "2026-08-20"),
      bet("lost", 2, 4_000, "2026-08-20"),
    ]);
    expect(s.series).toEqual([{ date: "2026-08-20", profit: 6_000 }, { date: "2026-08-22", profit: 1_000 }]);
  });

  test("by odds band and by market", () => {
    const s = betStats([
      bet("won", 2.5, 10_000, "2026-08-20"),
      bet("lost", 2.2, 10_000, "2026-08-20", { market: "scorer", playerId: "p", playerName: "P" }),
      bet("won", 12, 1_000, "2026-08-21", { market: "score", home: 3, away: 2 }),
    ]);
    const band = (k: string) => s.bands.find((b) => b.band === k)!;
    expect(band("2-3")).toMatchObject({ bets: 2, greens: 1, reds: 1, staked: 20_000, profit: 5_000, roi: 0.25 });
    expect(band("10+")).toMatchObject({ bets: 1, greens: 1, profit: 11_000 });
    expect(band("1.01-1.5")).toMatchObject({ bets: 0, roi: null });
    const market = (k: string) => s.markets.find((m) => m.market === k)!;
    expect(market("result").profit).toBe(15_000);
    expect(market("scorer").profit).toBe(-10_000);
    expect(market("score").greens).toBe(1);
  });

  test("nothing settled: empty lines and no rates", () => {
    const s = betStats([]);
    expect(s.totals.hitRate).toBeNull();
    expect(s.totals.roi).toBeNull();
    expect(s.series).toEqual([]);
    expect(s.bands).toHaveLength(6);
  });
});
