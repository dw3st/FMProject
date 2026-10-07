import { describe, expect, test } from "bun:test";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { SellCandidate, SquadMarketProfile } from "@/types/transferMarketTypes";
import { Player } from "@/Domain/Player";
import { playerOverallRating } from "@/Domain/transfer/transferNeeds";
import { mulberry32 } from "@/Domain/rng";
import { respondToHumanCounter, sellOnValueFraction } from "@/Domain/negotiation/negotiation";
import { buildAiTransferBid, generateBidsForHuman } from "@/Domain/negotiation/bids";
import {
  askingBand, askingBandExtra, askingFloor, defaultAskingPrice, askingFreqMult, askingOpening, askingRatio, askingStep, parseAskingPrice, stepAskingPrice,
} from "@/Domain/negotiation/askingPrice";

function stats(v: number): RosterPlayer["stats"] {
  return {
    passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v, pressing: v,
    stamina: v, heading: v, strength: v, reflex: v, jump: v,
  };
}

function player(id: string, v = 6, pos = "CM"): RosterPlayer {
  return {
    id, name: id, age: 26, squadId: "s", preferredFoot: "right", positions: [pos], stats: stats(v),
    profile: { summary: "", archetype: "t" }, contract: { until: "2028-05-31", wage: 20_000 },
  };
}

function squad(id: string, extra: Partial<Squad> = {}): Squad {
  const players = [
    ...Array.from({ length: 4 }, (_, i) => player(`${id}gk${i}`, 6, "GK")),
    ...Array.from({ length: 9 }, (_, i) => player(`${id}cb${i}`, 6, "CB")),
    ...Array.from({ length: 9 }, (_, i) => player(`${id}cm${i}`, 6, "CM")),
    ...Array.from({ length: 6 }, (_, i) => player(`${id}st${i}`, 6, "ST")),
  ].map((p) => ({ ...p, squadId: id }));
  return {
    id, name: `Club ${id}`, colors: ["#fff", "#000"], money: 0, players, financialTier: "HIGH",
    aiTransferBudget: 500_000_000,
    finances: { broadcasting: 30_000_000, commercial: 20_000_000, total: 50_000_000, budget: 20_000_000, followers: 1_000_000 },
    ...extra,
  };
}

const valueOf = (p: RosterPlayer) => new Player(playerOverallRating(p), p.age).price;

/** Three buyers whose midfield need sits `off` above the player's rating. */
function world(off: number) {
  const human = squad("h");
  const p = human.players.find((q) => q.id === "hcm0")!;
  const rating = playerOverallRating(p);
  const squads = new Map(["a", "b", "c"].map((id) => [id, squad(id)] as const));
  const profiles: Record<string, SquadMarketProfile> = {};
  for (const id of squads.keys()) {
    profiles[id] = {
      squadId: id, sellList: [], lastUpdateDay: "2027-03-01",
      needs: [{ position: "Midfielder", targetMin: rating + off, targetMax: rating + off + 0.5, urgency: 1, budgetTier: "high", intentType: "cover_need" }],
    };
  }
  return { human, p, squads, profiles };
}

function bidsOn(w: ReturnType<typeof world>, sellList: SellCandidate[], seed: number) {
  let n = 0;
  return generateBidsForHuman({
    date: "2027-03-01", rng: mulberry32(seed), humanSquad: w.human, squads: w.squads, profiles: w.profiles,
    sellList, loanList: [], pending: [], seasonEndOf: () => "2027-05-31", newId: () => String(++n),
  });
}

describe("asking price helpers", () => {
  test("ratio, frequency, band, opening", () => {
    expect(askingRatio(undefined, 10_000_000)).toBe(1);
    expect(askingRatio(8_000_000, 10_000_000)).toBeCloseTo(0.8);
    expect(askingFreqMult(1)).toBe(1);
    expect(askingFreqMult(0.8)).toBeCloseTo(1.4);
    expect(askingFreqMult(0.2)).toBe(2);
    expect(askingFreqMult(1.2)).toBeCloseTo(1 / 1.44);
    expect(askingBandExtra(1)).toBe(0);
    expect(askingBandExtra(1.3)).toBe(0);
    expect(askingBandExtra(0.9)).toBeCloseTo(0.25);
    expect(askingBandExtra(0.5)).toBe(0.5);
    expect(askingOpening(10_000_000, 10_000_000, 0.5)).toBeNull();
    expect(askingOpening(8_000_000, 10_000_000, 0)).toBeCloseTo(7_600_000);
    expect(askingOpening(8_000_000, 10_000_000, 1)).toBeCloseTo(8_000_000);
    const above = askingOpening(12_000_000, 10_000_000, 0.5)!;
    expect(above).toBeGreaterThan(10_000_000);
    expect(above).toBeLessThan(12_000_000);
  });
  test("parse and step", () => {
    expect(parseAskingPrice(1_234_567)).toBe(1_300_000);
    expect(parseAskingPrice(12_300_000)).toBe(13_000_000);
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "5", null, 3_000_000_000]) expect(parseAskingPrice(bad)).toBeNull();
    expect(askingStep(9_900_000)).toBe(100_000);
    expect(askingStep(10_000_000)).toBe(1_000_000);
    expect(stepAskingPrice(9_900_000, 1)).toBe(10_000_000);
    expect(stepAskingPrice(10_000_000, 1)).toBe(11_000_000);
    expect(stepAskingPrice(10_000_000, -1)).toBe(9_900_000);
    expect(stepAskingPrice(12_000_000, -1)).toBe(11_000_000);
    expect(stepAskingPrice(100_000, -1)).toBe(100_000);
    expect(askingBand(8_000_000, 10_000_000)).toBe("below");
    expect(askingBand(10_000_000, 10_000_000)).toBe("fair");
    expect(askingBand(12_000_000, 10_000_000)).toBe("above");
  });
});

describe("asking price on AI bids", () => {
  test("no price and price = value give exactly the same bids", () => {
    const w = world(-0.2);
    const value = valueOf(w.p);
    for (let seed = 1; seed <= 30; seed++) {
      const plain = bidsOn(w, [{ playerId: w.p.id, priority: 1 }], seed);
      const priced = bidsOn(w, [{ playerId: w.p.id, priority: 1, askingPrice: value }], seed);
      expect(priced).toEqual(plain);
    }
  });
  test("below the value: the bid sits near the asking price and never above it", () => {
    const w = world(-0.2);
    const asking = Math.round(valueOf(w.p) * 0.8);
    for (let seed = 1; seed <= 20; seed++) {
      const bid = buildAiTransferBid({ id: "x", player: w.p, buyer: w.squads.get("a")!, date: "2027-03-01", rng: mulberry32(seed), askingPrice: asking });
      expect(bid).not.toBeNull();
      expect(bid!.maxFee!).toBeLessThanOrEqual(asking);
      if (!bid!.sellOnPct) expect(bid!.fee).toBeGreaterThanOrEqual(asking * 0.95 - 100_000);
    }
  });
  test("above the value: the bid opens between the value and the asking price", () => {
    const w = world(-0.2);
    const value = valueOf(w.p);
    const asking = Math.round(value * 1.2);
    for (let seed = 1; seed <= 20; seed++) {
      const bid = buildAiTransferBid({ id: "x", player: w.p, buyer: w.squads.get("a")!, date: "2027-03-01", rng: mulberry32(seed), askingPrice: asking })!;
      if (bid.sellOnPct) continue;
      expect(bid.fee).toBeGreaterThanOrEqual(value - 100_000);
      expect(bid.fee).toBeLessThan(asking);
    }
  });
  test("a discount widens the rating band; a premium lets fewer days through", () => {
    // The need misses him by 0.8: outside the plain slack (0.5), inside 0.5 + 0.5 extra.
    const far = world(0.8);
    const value = valueOf(far.p);
    expect(bidsOn(far, [{ playerId: far.p.id, priority: 1 }], 7)).toEqual([]);
    expect(bidsOn(far, [{ playerId: far.p.id, priority: 1, askingPrice: Math.round(value * 0.7) }], 7).length).toBeGreaterThan(0);

    const near = world(-0.2);
    const count = (price: number | undefined) => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) {
        n += bidsOn(near, [{ playerId: near.p.id, priority: 1, ...(price ? { askingPrice: price } : {}) }], seed).length;
      }
      return n;
    };
    const plain = count(undefined);
    expect(count(Math.round(value * 1.3))).toBeLessThan(plain * 0.8);
    expect(count(Math.round(value * 0.8))).toBeGreaterThan(plain);
  });
});

describe("asking price: floor, transfer request, counters", () => {
  test("floor is 0.3 x value (at least 0.1M); a 0 value defaults to 0.1M", () => {
    expect(askingFloor(20_000_000)).toBe(6_000_000);
    expect(askingFloor(0)).toBe(100_000);
    expect(defaultAskingPrice(0)).toBe(100_000);
    expect(defaultAskingPrice(7_000_000)).toBe(7_000_000);
    expect(parseAskingPrice(5_900_000, 20_000_000)).toBeNull();
    expect(parseAskingPrice(6_000_000, 20_000_000)).toBe(6_000_000);
    expect(parseAskingPrice(100_000, 0)).toBe(100_000);
  });
  test("transfer request: price = value gives exactly the same bids as no price", () => {
    const w = world(0.8);
    const asked = { ...w.p, moraleLog: { minutes: [], trend: [], transferRequest: "2027-03-01" } };
    const human = { ...w.human, players: w.human.players.map((q) => (q.id === asked.id ? asked : q)) };
    const value = valueOf(asked);
    const ww = { ...w, human, p: asked };
    for (let seed = 1; seed <= 30; seed++) {
      const plain = bidsOn(ww, [{ playerId: asked.id, priority: 1, requested: true }], seed);
      const priced = bidsOn(ww, [{ playerId: asked.id, priority: 1, requested: true, askingPrice: value }], seed);
      expect(priced).toEqual(plain);
    }
  });
  test("transfer request with an asking price never caps above the asking price", () => {
    const w = world(-0.2);
    const asked = { ...w.p, moraleLog: { minutes: [], trend: [], transferRequest: "2027-03-01" } };
    const value = valueOf(asked);
    for (const ratio of [0.5, 0.8, 1.2]) {
      const asking = Math.round(value * ratio);
      for (let seed = 1; seed <= 20; seed++) {
        const bid = buildAiTransferBid({ id: "x", player: asked, buyer: w.squads.get("a")!, date: "2027-03-01", rng: mulberry32(seed), seller: w.human, askingPrice: asking });
        if (!bid) continue;
        expect(bid.maxFee!).toBeLessThanOrEqual(asking);
        expect(bid.fee).toBeLessThanOrEqual(bid.maxFee!);
      }
    }
  });
  test("a counter with a sell-on clause stays within the asking price", () => {
    const w = world(-0.2);
    const value = valueOf(w.p);
    for (const ratio of [0.8, 1.2]) {
      const asking = Math.round(value * ratio);
      const bid = buildAiTransferBid({ id: "x", player: w.p, buyer: w.squads.get("a")!, date: "2027-03-01", rng: mulberry32(3), askingPrice: asking })!;
      const answer = respondToHumanCounter(bid, asking * 2, 20, w.p.age);
      expect(answer.kind).toBe("counter");
      if (answer.kind !== "counter") continue;
      expect(answer.bid.fee).toBeLessThanOrEqual(asking / (1 + sellOnValueFraction(20, w.p.age)));
      expect(respondToHumanCounter(bid, answer.bid.fee, 20, w.p.age).kind).toBe("accept");
    }
  });
});
