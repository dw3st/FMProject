import { describe, expect, test } from "bun:test";
import { BINGO, bestPattern, drawBalls, drawCard, parseBingoCards, playBingo } from "@/Domain/casino/bingo";
import {
  applyAction, basicStrategy, dealRound, handTotal, isBlackjack, legalActions, playerDone, settle, settlesAtOnce,
  type BlackjackRound,
} from "@/Domain/casino/blackjack";
import { blackjackView } from "@/Domain/casino/blackjackView";
import { rankOf, shuffledShoe, suitOf } from "@/Domain/casino/cards";
import { drawOrder, parseRaceBet, RACE, raceCard, racePayout } from "@/Domain/casino/race";
import { mulberry32 } from "@/Domain/rng";

// Card helpers: rank 2..14, suit 0..3.
const c = (rank: number, suit = 0) => suit * 13 + (rank - 2);

function round(player: number[], dealer: number[], shoe: number[] = [], stake = 1000): BlackjackRound {
  return { id: "t", date: "2027-01-01", shoe, dealer, hands: [{ cards: player, stake, done: false, doubled: false, splitAces: false }], active: 0, split: false };
}

describe("cards", () => {
  test("shoe has every card the right number of times", () => {
    const shoe = shuffledShoe(6, mulberry32(1));
    expect(shoe.length).toBe(312);
    const counts = new Map<number, number>();
    for (const x of shoe) counts.set(x, (counts.get(x) ?? 0) + 1);
    expect([...counts.values()].every((n) => n === 6)).toBe(true);
    expect(rankOf(c(14, 2))).toBe(14);
    expect(suitOf(c(14, 2))).toBe(2);
  });
});

describe("race", () => {
  test("a race card is the same for the same salt and number", () => {
    expect(raceCard("salt", 3)).toEqual(raceCard("salt", 3));
    expect(raceCard("salt", 3)).not.toEqual(raceCard("salt", 4));
    const card = raceCard("salt", 0);
    expect(card.cars.length).toBe(RACE.CARS);
    expect(new Set(card.cars.map((x) => x.name)).size).toBe(RACE.CARS);
    for (const car of card.cars) expect(car.top3Odds).toBeLessThanOrEqual(car.winOdds);
  });

  test("finishing order is a permutation", () => {
    const order = drawOrder([1, 2, 3, 4, 5, 6, 7, 8], mulberry32(5));
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  test("payout: win only first, top 3 the podium", () => {
    const card = raceCard("salt", 0);
    const order = [2, 0, 5, 1, 3, 4, 6, 7];
    expect(racePayout(card, order, 3, "win")).toBe(card.cars[2]!.winOdds);
    expect(racePayout(card, order, 1, "win")).toBe(0);
    expect(racePayout(card, order, 6, "top3")).toBe(card.cars[5]!.top3Odds);
    expect(racePayout(card, order, 2, "top3")).toBe(0);
  });

  test("bet parsing", () => {
    expect(parseRaceBet(4, "win")).toEqual({ car: 4, kind: "win" });
    expect(parseRaceBet(0, "win")).toBeNull();
    expect(parseRaceBet(9, "top3")).toBeNull();
    expect(parseRaceBet(2, "place")).toBeNull();
  });
});

describe("blackjack", () => {
  test("totals with soft aces", () => {
    expect(handTotal([c(14), c(6)])).toEqual({ total: 17, soft: true });
    expect(handTotal([c(14), c(6), c(10)])).toEqual({ total: 17, soft: false });
    expect(handTotal([c(14), c(14), c(9)])).toEqual({ total: 21, soft: true });
    expect(isBlackjack([c(14), c(13)])).toBe(true);
  });

  test("player blackjack pays 3:2 at once", () => {
    const r = round([c(14), c(12)], [c(9), c(7)]);
    expect(settlesAtOnce(r)).toBe(true);
    const s = settle(r).settlement;
    expect(s.outcomes).toEqual(["blackjack"]);
    expect(s.payout).toBe(2500);
  });

  test("dealer draws to 17 and the higher total wins", () => {
    const r = applyAction(round([c(10), c(9)], [c(10), c(6)], [c(5)]), "stand");
    expect(playerDone(r)).toBe(true);
    const out = settle(r);
    expect(handTotal(out.round.dealer).total).toBe(21);
    expect(out.settlement.outcomes).toEqual(["lose"]);
  });

  test("double takes one card and doubles the stake", () => {
    const r = applyAction(round([c(6), c(5)], [c(10), c(7)], [c(10)]), "double");
    expect(r.hands[0]!.stake).toBe(2000);
    expect(r.hands[0]!.cards.length).toBe(3);
    expect(settle(r).settlement.payout).toBe(4000);
  });

  test("split makes two hands, split aces stand after one card", () => {
    const r0 = round([c(14), c(14, 1)], [c(10), c(7)], [c(9), c(10)]);
    expect(legalActions(r0)).toContain("split");
    const r = applyAction(r0, "split");
    expect(r.hands.length).toBe(2);
    expect(playerDone(r)).toBe(true);
    const s = settle(r).settlement;
    expect(s.staked).toBe(2000);
    expect(s.outcomes).toEqual(["win", "win"]);
  });

  test("bust loses without the dealer drawing", () => {
    const r = applyAction(round([c(10), c(6)], [c(10), c(2)], [c(10), c(9)]), "hit");
    const out = settle(r);
    expect(out.settlement.outcomes).toEqual(["bust"]);
    expect(out.round.dealer.length).toBe(2);
  });

  test("the view hides the hole card until the end", () => {
    const r = round([c(10), c(6)], [c(10), c(2)]);
    expect(blackjackView(r, null).dealer).toEqual([c(10)]);
    expect(blackjackView(r, settle(r).settlement).dealer.length).toBe(2);
  });

  test("basic strategy returns close to the house edge of S17 3:2", () => {
    const rng = mulberry32(3);
    let staked = 0;
    let back = 0;
    for (let i = 0; i < 40_000; i++) {
      let r = dealRound("x", "d", 1000, rng);
      if (!settlesAtOnce(r)) while (!playerDone(r)) r = applyAction(r, basicStrategy(r));
      const s = settle(r).settlement;
      staked += 1000;
      back += s.payout - s.staked + 1000;
    }
    expect(back / staked).toBeGreaterThan(0.97);
    expect(back / staked).toBeLessThan(1.02);
  });
});

describe("bingo", () => {
  test("card columns hold their range, centre free", () => {
    const card = drawCard(mulberry32(2));
    expect(card[12]).toBe(0);
    for (let i = 0; i < 25; i++) {
      if (i === 12) continue;
      const k = i % 5;
      expect(card[i]!).toBeGreaterThanOrEqual(15 * k + 1);
      expect(card[i]!).toBeLessThanOrEqual(15 * k + 15);
    }
    expect(new Set(drawBalls(mulberry32(2))).size).toBe(BINGO.DRAWN);
  });

  test("patterns", () => {
    const card = Array.from({ length: 25 }, (_, i) => (i === 12 ? 0 : i + 1));
    expect(bestPattern(card, [1, 2, 3, 4, 5])).toBe("line");
    expect(bestPattern(card, [1, 2, 3, 4, 5, 6, 11, 16, 21])).toBe("twoLines");
    expect(bestPattern(card, [1, 5, 21, 25])).toBe("corners");
    expect(bestPattern(card, [1, 7, 19, 25, 5, 9, 17, 21])).toBe("x");
    expect(bestPattern(card, card.filter((n) => n > 0))).toBe("full");
    expect(bestPattern(card, [1, 2])).toBeNull();
  });

  test("a game pays each card by its pattern", () => {
    const g = playBingo(3, mulberry32(9));
    expect(g.cards.length).toBe(3);
    for (const card of g.cards) expect(card.multiplier).toBe(card.pattern ? BINGO.PAYS[card.pattern] : 0);
    expect(parseBingoCards(5)).toBeNull();
    expect(parseBingoCards(undefined)).toBe(1);
  });

  test("return to player near 92% (the X, ~1 in 2900, adds ~0.14; measured in scripts/casino-rtp.ts)", () => {
    const rng = mulberry32(11);
    let common = 0;
    const n = 60_000;
    for (let i = 0; i < n; i++) {
      const card = playBingo(1, rng).cards[0]!;
      if (card.pattern !== "x" && card.pattern !== "full") common += card.multiplier;
    }
    expect(common / n + 0.14).toBeGreaterThan(0.88);
    expect(common / n + 0.14).toBeLessThan(0.96);
  });
});
