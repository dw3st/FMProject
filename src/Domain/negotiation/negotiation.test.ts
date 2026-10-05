import { describe, expect, test } from "bun:test";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { Player } from "@/Domain/Player";
import { playerOverallRating } from "@/Domain/transfer/transferNeeds";
import {
  activeCounter, pruneTalks, recordRound, respondToHumanCounter, respondToOffer, roundFeeDown, roundFeeUp,
  sellOnShare, sellOnValueFraction, talkGate, parseSellOnPct,
} from "@/Domain/negotiation/negotiation";
import {
  dueLoans, outgoingLoanCount, loanAvailability, loanUntil, parentLoanWages, respondToLoanRequest, squadsAfterLoanEnd, squadsAfterLoanStart,
} from "@/Domain/negotiation/loans";
import { buildAiTransferBid, generateBidsForHuman, liveBids } from "@/Domain/negotiation/bids";
import { saleContext, squadsAfterAcceptedTransfer } from "@/Domain/transfer/transferAcceptance";
import { clubWage, squadWeeklyWages } from "@/Domain/finance/wages";
import type { MarketBid } from "@/types/transferMarketTypes";
import { toFreeAgent } from "@/Domain/contracts/freeAgents";

function stats(v: number): RosterPlayer["stats"] {
  return {
    passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v, pressing: v,
    stamina: v, heading: v, strength: v, reflex: v, jump: v,
  };
}

function player(id: string, v = 6, age = 26, pos = "CM", extra: Partial<RosterPlayer> = {}): RosterPlayer {
  return {
    id, name: id, age, squadId: "s", preferredFoot: "right", positions: [pos], stats: stats(v),
    profile: { summary: "", archetype: "t" }, contract: { until: "2028-05-31", wage: 20_000 }, ...extra,
  };
}

/** 4 GK, 9 DEF, 9 MID, 6 FWD: every role above its minimum. */
function squad(id: string, v = 6, extra: Partial<Squad> = {}): Squad {
  const players = [
    ...Array.from({ length: 4 }, (_, i) => player(`${id}gk${i}`, v, 26, "GK")),
    ...Array.from({ length: 9 }, (_, i) => player(`${id}cb${i}`, v, 26, "CB")),
    ...Array.from({ length: 9 }, (_, i) => player(`${id}cm${i}`, v, 26, "CM")),
    ...Array.from({ length: 6 }, (_, i) => player(`${id}st${i}`, v, 26, "ST")),
  ].map((p) => ({ ...p, squadId: id }));
  return {
    id, name: `Club ${id}`, colors: ["#fff", "#000"], money: 0, players, financialTier: "MEDIUM",
    finances: { broadcasting: 30_000_000, commercial: 20_000_000, total: 50_000_000, budget: 20_000_000, followers: 1_000_000 },
    ...extra,
  };
}

const valueOf = (p: RosterPlayer) => new Player(playerOverallRating(p), p.age).price;

describe("fees and sell-on", () => {
  test("rounding: 0,1M below 10M, 1M above", () => {
    expect(roundFeeUp(1_234_567)).toBe(1_300_000);
    expect(roundFeeUp(12_100_000)).toBe(13_000_000);
    expect(roundFeeUp(2_000_000)).toBe(2_000_000);
    expect(roundFeeDown(12_900_000)).toBe(12_000_000);
  });
  test("sell-on value: 4% per 10%, 6% for a young player", () => {
    expect(sellOnValueFraction(20, 27)).toBeCloseTo(0.08);
    expect(sellOnValueFraction(30, 21)).toBeCloseTo(0.18);
    expect(sellOnValueFraction(0, 21)).toBe(0);
    expect(sellOnShare(10_000_000, 20)).toBe(2_000_000);
  });
  test("parseSellOnPct only takes 0/10/20/30", () => {
    expect(parseSellOnPct(undefined)).toBe(0);
    expect(parseSellOnPct(20)).toBe(20);
    expect(parseSellOnPct(15)).toBeNull();
    expect(parseSellOnPct("10")).toBeNull();
  });
});

describe("respondToOffer", () => {
  const seller = squad("ai", 6);
  const target = seller.players.find((p) => p.id === "aicm0")!;
  const value = valueOf(target);

  test("a strong offer is accepted", () => {
    expect(respondToOffer({ player: target, seller, fee: value * 2 }).kind).toBe("accept");
  });
  test("a lowball (below 60% of value) ends the talks", () => {
    const r = respondToOffer({ player: target, seller, fee: value * 0.5 });
    expect(r).toEqual({ kind: "reject", reason: "insulted" });
  });
  test("a middling offer gets a counter that is then accepted", () => {
    const r = respondToOffer({ player: target, seller, fee: value * 0.9 });
    expect(r.kind).toBe("counter");
    if (r.kind !== "counter") return;
    expect(r.counterFee).toBeGreaterThan(value * 0.9);
    expect(respondToOffer({ player: target, seller, fee: r.counterFee }).kind).toBe("accept");
    const step = r.counterFee < 10_000_000 ? 100_000 : 1_000_000;
    expect(respondToOffer({ player: target, seller, fee: r.counterFee - step * 3 }).kind).not.toBe("accept");
  });
  test("a sell-on clause lowers the counter", () => {
    const plain = respondToOffer({ player: target, seller, fee: value * 0.9 });
    const withClause = respondToOffer({ player: target, seller, fee: value * 0.9, sellOnPct: 30 });
    expect(plain.kind).toBe("counter");
    if (plain.kind !== "counter") return;
    if (withClause.kind === "counter") expect(withClause.counterFee).toBeLessThan(plain.counterFee);
    else expect(withClause.kind).toBe("accept");
  });
  test("a star is countered, never sold cheap", () => {
    const star = { ...player("star", 9, 26, "CM"), squadId: "ai" };
    const withStar = { ...seller, players: [...seller.players, star] };
    const v = valueOf(star);
    const r = respondToOffer({ player: star, seller: withStar, fee: v * 0.75 });
    expect(r.kind).toBe("counter");
    if (r.kind === "counter") expect(r.counterFee).toBeGreaterThanOrEqual(v * 0.8);
  });
  test("squad depth refuses", () => {
    const thin = { ...seller, players: seller.players.slice(0, 14) };
    expect(respondToOffer({ player: thin.players[5]!, seller: thin, fee: 1e9 })).toEqual({ kind: "reject", reason: "squadDepth" });
  });
});

describe("talks", () => {
  const init = { playerId: "p", kind: "transfer" as const, date: "2027-03-01" };
  test("3 rounds a day, then noRounds; a new day resets", () => {
    let talk = undefined as ReturnType<typeof recordRound> | undefined;
    for (let i = 0; i < 3; i++) {
      expect(talkGate(talk, init.date)).toBe("ok");
      talk = recordRound(talk, init, { fee: 1 }, { by: "club", fee: 5, outcome: "counter" });
    }
    expect(talkGate(talk, init.date)).toBe("noRounds");
    expect(talkGate(talk, init.date, true)).toBe("ok");
    expect(activeCounter(talk, init.date)?.fee).toBe(5);
    expect(talkGate(talk, "2027-03-02")).toBe("ok");
    expect(activeCounter(talk, "2027-03-02")).toBeUndefined();
    const next = recordRound(talk, { ...init, date: "2027-03-02" }, { fee: 2 }, { by: "club", outcome: "rejected" });
    expect(next.rounds).toBe(1);
  });
  test("an insult closes the talks for 14 days", () => {
    const talk = recordRound(undefined, init, { fee: 1 }, { by: "club", outcome: "insulted" });
    expect(talkGate(talk, "2027-03-10")).toBe("closed");
    expect(talkGate(talk, "2027-03-15")).toBe("closed");
    expect(talkGate(talk, "2027-03-16")).toBe("ok");
    expect(Object.keys(pruneTalks({ a: talk }, "2027-03-10"))).toEqual(["a"]);
    expect(Object.keys(pruneTalks({ a: talk }, "2027-03-20"))).toEqual([]);
  });
});

describe("human counter on an AI bid", () => {
  const bid: MarketBid = {
    id: "b", kind: "transfer", playerId: "p", playerName: "P", clubId: "c", clubName: "C",
    date: "2027-03-01", expires: "2027-03-06", fee: 8_000_000, maxFee: 10_000_000, sellOnPct: 0,
  };
  test("accepted up to the max", () => {
    expect(respondToHumanCounter(bid, 10_000_000, 0, 27)).toEqual({ kind: "accept", fee: 10_000_000, sellOnPct: 0 });
  });
  test("above the max: one counter with the max, then closed", () => {
    const r = respondToHumanCounter(bid, 14_000_000, 0, 27);
    expect(r.kind).toBe("counter");
    if (r.kind !== "counter") return;
    expect(r.bid.fee).toBe(10_000_000);
    expect(respondToHumanCounter(r.bid, 12_000_000, 0, 27).kind).toBe("closed");
  });
  test("asking for a sell-on lowers the max", () => {
    const r = respondToHumanCounter(bid, 10_000_000, 20, 27);
    expect(r.kind).toBe("counter");
    if (r.kind === "counter") expect(r.bid.fee).toBeLessThan(10_000_000);
  });
});

describe("sell-on on the player", () => {
  test("a transfer drops the old clause and keeps the new one", () => {
    const seller = squad("a");
    const buyer = squad("b");
    const p = { ...seller.players[0]!, sellOn: { clubId: "x", clubName: "X", pct: 20 } };
    const sellerWith = { ...seller, players: [p, ...seller.players.slice(1)] };
    const plain = squadsAfterAcceptedTransfer(p, sellerWith, buyer, "b", p.id);
    expect(plain.buying.players.find((q) => q.id === p.id)!.sellOn).toBeUndefined();
    const kept = squadsAfterAcceptedTransfer(p, sellerWith, buyer, "b", p.id, undefined, null, { clubId: "a", clubName: "A", pct: 10 });
    expect(kept.buying.players.find((q) => q.id === p.id)!.sellOn).toEqual({ clubId: "a", clubName: "A", pct: 10 });
  });
});

describe("loans", () => {
  test("until: the season end, or the next one when under 60 days remain", () => {
    expect(loanUntil("2027-01-10", "2027-05-31")).toBe("2027-05-31");
    expect(loanUntil("2027-04-15", "2027-05-31")).toBe("2028-05-31");
    expect(loanUntil("2027-07-01", "2027-05-31")).toBe("2028-05-31");
  });
  test("availability: never a starter; young, listed or surplus", () => {
    const parent = squad("p");
    const young = { ...parent.players.find((p) => p.id === "pcm0")!, age: 20 };
    const withYoung = { ...parent, players: [young, ...parent.players.filter((p) => p.id !== "pcm0")] };
    expect(loanAvailability(young, withYoung, { starterIds: new Set([young.id]), listed: false })).toBe("starter");
    expect(loanAvailability(young, withYoung, { starterIds: new Set(), listed: false })).toBeNull();
    const gk = parent.players.find((p) => p.id === "pgk0")!;
    const threeGk = { ...parent, players: parent.players.filter((p) => p.id !== "pgk3") };
    expect(loanAvailability(gk, threeGk, { starterIds: new Set(), listed: true })).toBe("squadDepth");
    // 9 MID: 8 left, not surplus (needs more than minimum 7 + 1); 26 years, not listed.
    expect(loanAvailability(parent.players.find((p) => p.id === "pcm1")!, parent, { starterIds: new Set(), listed: false })).toBe("notAvailable");
    const deep = { ...parent, players: [...parent.players, { ...player("pcm9", 6), squadId: "p" }] };
    expect(loanAvailability(parent.players.find((p) => p.id === "pcm1")!, deep, { starterIds: new Set(), listed: false })).toBeNull();
  });
  test("full wage accepts; low share counters; counter is accepted", () => {
    const parent = squad("p");
    const target = parent.players.find((p) => p.id === "pcm3")!;
    const base = { player: target, parent, weeks: 20, starterIds: new Set<string>(), listed: true };
    expect(respondToLoanRequest({ ...base, wageShare: 1, fee: 0 }).kind).toBe("accept");
    const r = respondToLoanRequest({ ...base, wageShare: 0, fee: 0 });
    expect(r.kind).toBe("counter");
    if (r.kind !== "counter") return;
    expect(respondToLoanRequest({ ...base, wageShare: r.wageShare, fee: r.fee }).kind).toBe("accept");
    // A standout costs more than his full wage: the counter asks for a loan fee.
    const star = { ...player("star", 8, 26, "CM"), squadId: "p" };
    const withStar = { ...parent, players: [...parent.players, star] };
    const s = respondToLoanRequest({ ...base, player: star, parent: withStar, wageShare: 1, fee: 0 });
    expect(s.kind).toBe("counter");
    if (s.kind === "counter") expect(s.fee).toBeGreaterThan(0);
  });
  test("start and end move the player and mark the history row", () => {
    const parent = squad("p");
    const borrower = squad("b");
    const target = { ...parent.players.find((p) => p.id === "pcm3")!, seasonLog: undefined };
    const loan = { fromClubId: "p", fromClubName: "Club p", until: "2027-05-31", wageShare: 0.5 };
    const started = squadsAfterLoanStart(target, parent, borrower, loan);
    const moved = started.borrower.players.find((p) => p.id === target.id)!;
    expect(moved.loan).toEqual(loan);
    expect(started.parent.players.some((p) => p.id === target.id)).toBe(false);
    expect(clubWage(moved, 1)).toBe(10_000);
    expect(squadWeeklyWages([moved], 1)).toBe(10_000);
    const ended = squadsAfterLoanEnd(moved, started.borrower, started.parent);
    expect(ended.parent.players.find((p) => p.id === target.id)!.loan).toBeUndefined();
    expect(ended.borrower.players.some((p) => p.id === target.id)).toBe(false);
  });
  test("due loans and the parent wage share", () => {
    const loans = [
      { playerId: "a", playerName: "A", fromClubId: "h", fromClubName: "H", toClubId: "x", toClubName: "X", until: "2027-05-31", wageShare: 0.6, wage: 10_000, fee: 0, start: "2027-01-01" },
      { playerId: "b", playerName: "B", fromClubId: "y", fromClubName: "Y", toClubId: "h", toClubName: "H", until: "2027-07-10", wageShare: 1, wage: 5_000, fee: 0, start: "2027-01-01" },
    ];
    expect(dueLoans(loans, "2027-05-31").map((l) => l.playerId)).toEqual(["a"]);
    expect(dueLoans(loans, "2027-05-31", 60).map((l) => l.playerId)).toEqual(["a", "b"]);
    expect(parentLoanWages(loans, "h")).toBe(4_000);
  });
});

describe("AI bids", () => {
  test("transfer bid: opening fee within the max, max at most 1.25 x value", () => {
    const human = squad("h");
    const buyer = squad("b", 6, { financialTier: "HIGH" });
    const p = human.players.find((q) => q.id === "hcm0")!;
    const bid = buildAiTransferBid({ id: "1", player: p, buyer, date: "2027-03-01", rng: () => 0.5 })!;
    expect(bid).not.toBeNull();
    expect(bid.fee).toBeLessThanOrEqual(bid.maxFee!);
    expect(bid.maxFee!).toBeLessThanOrEqual(valueOf(p) * 1.25);
    expect(bid.expires).toBe("2027-03-06");
  });
  test("listed player gets a bid from a club needing his role; loan-listed one a loan bid", () => {
    const human = squad("h");
    const buyer = squad("b", 6, { financialTier: "HIGH" });
    const listed = human.players.find((q) => q.id === "hcm0")!;
    const loanee = human.players.find((q) => q.id === "hst0")!;
    const rating = playerOverallRating(listed);
    const profiles = {
      b: {
        squadId: "b", sellList: [], lastUpdateDay: "2027-03-01",
        needs: [
          { position: "Midfielder" as const, targetMin: rating - 0.2, targetMax: rating + 0.2, urgency: 1, budgetTier: "high" as const, intentType: "cover_need" as const },
          { position: "Forward" as const, targetMin: 0, targetMax: 10, urgency: 1, budgetTier: "high" as const, intentType: "cover_need" as const },
        ],
      },
    };
    let n = 0;
    const bids = generateBidsForHuman({
      date: "2027-03-01", rng: () => 0.1, humanSquad: human, squads: new Map([["b", buyer]]), profiles,
      sellList: [{ playerId: listed.id, priority: 1 }], loanList: [loanee.id], pending: [],
      seasonEndOf: () => "2027-05-31", newId: () => String(++n),
    });
    expect(bids.find((b) => b.kind === "transfer")?.playerId).toBe(listed.id);
    const loanBid = bids.find((b) => b.kind === "loan")!;
    expect(loanBid.playerId).toBe(loanee.id);
    expect(loanBid.wageShare).toBeGreaterThanOrEqual(0.5);
    expect(loanBid.until).toBe("2027-05-31");
    const again = generateBidsForHuman({
      date: "2027-03-02", rng: () => 0.1, humanSquad: human, squads: new Map([["b", buyer]]), profiles,
      sellList: [{ playerId: listed.id, priority: 1 }], loanList: [loanee.id], pending: bids,
      seasonEndOf: () => "2027-05-31", newId: () => String(++n),
    });
    expect(again).toEqual([]);
    expect(liveBids(bids, "2027-03-07", human)).toEqual([]);
    expect(liveBids(bids, "2027-03-06", human).length).toBe(2);
  });
});

describe("transfer request (morale)", () => {
  test("a requested player draws bids from a wider band than a plain listing", () => {
    const human = squad("h");
    const buyer = squad("b", 6, { financialTier: "HIGH" });
    const p = human.players.find((q) => q.id === "hcm0")!;
    const rating = playerOverallRating(p);
    // The need's band misses him by 0.8: outside the plain slack (0.5), inside the request's (1).
    const profiles = {
      b: {
        squadId: "b", sellList: [], lastUpdateDay: "2027-03-01",
        needs: [{ position: "Midfielder" as const, targetMin: rating + 0.8, targetMax: rating + 1.5, urgency: 1, budgetTier: "high" as const, intentType: "cover_need" as const }],
      },
    };
    const args = (requested: boolean) => ({
      date: "2027-03-01", rng: () => 0.1, humanSquad: human, squads: new Map([["b", buyer]]), profiles,
      sellList: [{ playerId: p.id, priority: 1, ...(requested ? { requested: true as const } : {}) }], loanList: [], pending: [],
      seasonEndOf: () => "2027-05-31", newId: () => "x",
    });
    expect(generateBidsForHuman(args(false))).toEqual([]);
    expect(generateBidsForHuman(args(true)).map((b) => b.playerId)).toEqual([p.id]);
  });
});

describe("transfer request pricing (morale)", () => {
  test("a player who asked to leave is priced as a LOW-tier sale: cheaper bid, lower ceiling, pressure 1", () => {
    const human = squad("h", 6, { finances: { broadcasting: 0, commercial: 0, total: 0, budget: 500_000_000, followers: 0 } });
    const buyer = squad("b", 6, { financialTier: "HIGH", aiTransferBudget: 500_000_000 });
    const p = human.players.find((q) => q.id === "hcm0")!;
    const asked = { ...p, moraleLog: { minutes: [], trend: [], transferRequest: "2027-03-01" } };
    const plain = buildAiTransferBid({ id: "1", player: p, buyer, date: "2027-03-01", rng: () => 0.99, seller: human })!;
    const req = buildAiTransferBid({ id: "2", player: asked, buyer, date: "2027-03-01", rng: () => 0.99, seller: human })!;
    expect(req.fee).toBeLessThan(plain.fee);
    expect(req.maxFee!).toBeLessThan(plain.maxFee!);
    expect(saleContext(asked, human, 1, { humanSeller: true }).financialPressure).toBe(1);
    expect(saleContext(p, human, 1, { humanSeller: true }).financialPressure).toBe(0.1);
  });
});

describe("review fixes", () => {
  test("bids skip a player the human club could not let go", () => {
    const thin = squad("h");
    const gks = thin.players.filter((p) => p.positions[0] === "GK");
    const threeGk = { ...thin, players: thin.players.filter((p) => p.id !== gks[3]!.id) };
    const buyer = squad("b", 6, { financialTier: "HIGH" });
    const profiles = {
      b: {
        squadId: "b", sellList: [], lastUpdateDay: "2027-03-01",
        needs: [{ position: "GK" as const, targetMin: 0, targetMax: 10, urgency: 1, budgetTier: "high" as const, intentType: "cover_need" as const }],
      },
    };
    const bids = generateBidsForHuman({
      date: "2027-03-01", rng: () => 0.1, humanSquad: threeGk, squads: new Map([["b", buyer]]), profiles,
      sellList: [{ playerId: gks[0]!.id, priority: 1 }], loanList: [gks[1]!.id], pending: [],
      seasonEndOf: () => "2027-05-31", newId: () => "x",
    });
    expect(bids).toEqual([]);
  });
  test("outgoing loans count toward the cap", () => {
    const loans = [{ playerId: "a", playerName: "A", fromClubId: "h", fromClubName: "H", toClubId: "x", toClubName: "X", until: "2027-05-31", wageShare: 1, wage: 1, fee: 0, start: "2027-01-01" }];
    expect(outgoingLoanCount(loans, "h")).toBe(1);
    expect(outgoingLoanCount(loans, "x")).toBe(0);
  });
  test("a released player drops his clause and loan", () => {
    const p = player("p", 6, 26, "CM", { sellOn: { clubId: "c", clubName: "C", pct: 10 }, loan: { fromClubId: "c", fromClubName: "C", until: "2027-05-31", wageShare: 1 } });
    const f = toFreeAgent(p, "2027-06-01");
    expect(f.player.sellOn).toBeUndefined();
    expect(f.player.loan).toBeUndefined();
  });
});
