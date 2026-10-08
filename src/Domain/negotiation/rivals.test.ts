import { describe, expect, test } from "bun:test";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import type { RivalBid, SquadMarketProfile } from "@/types/transferMarketTypes";
import {
  liveRivals, preferenceScore, preferredClub, rivalCandidates, rivalFloor, rollRival, starterChance,
} from "@/Domain/negotiation/rivals";
import { answerPreContract, preContractEligible } from "@/Domain/negotiation/preContract";
import { respondToOffer } from "@/Domain/negotiation/negotiation";

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
function squad(id: string, v = 6, extra: Partial<Squad> = {}): Squad {
  const players = [
    ...Array.from({ length: 3 }, (_, i) => player(`${id}gk${i}`, v, 26, "GK")),
    ...Array.from({ length: 8 }, (_, i) => player(`${id}cb${i}`, v, 26, "CB")),
    ...Array.from({ length: 8 }, (_, i) => player(`${id}cm${i}`, v, 26, "CM")),
    ...Array.from({ length: 5 }, (_, i) => player(`${id}st${i}`, v, 26, "ST")),
  ].map((p) => ({ ...p, squadId: id }));
  return {
    id, name: `Club ${id}`, colors: ["#fff", "#000"], money: 0, players, financialTier: "HIGH", aiTransferBudget: 80_000_000,
    finances: { broadcasting: 60_000_000, commercial: 40_000_000, total: 100_000_000, budget: 0, followers: 1_000_000 },
    wageFactor: 1, wageRevenueBasis: 100_000_000,
    ...extra,
  };
}
const need = (pos: "Midfielder", lo: number, hi: number, urgency = 1): SquadMarketProfile => ({
  squadId: "", needs: [{ position: pos, targetMin: lo, targetMax: hi, urgency, budgetTier: "high", intentType: "cover_need" }],
  sellList: [], lastUpdateDay: "",
});

describe("rivals for the same target", () => {
  const seller = squad("sel", 6);
  const target = seller.players.find((p) => p.positions[0] === "CM")!;
  const buyer = squad("buy", 6);
  const profiles = { buy: need("Midfielder", 5, 7), sel: need("Midfielder", 5, 7), hum: need("Midfielder", 5, 7) };

  test("candidates: need on his line, never the seller or the human", () => {
    const c = rivalCandidates({ player: target, sellerId: "sel", humanId: "hum", profiles, squadOf: (id) => (id === "buy" ? buyer : null) });
    expect(c.map((x) => x.squad.id)).toEqual(["buy"]);
    expect(rivalCandidates({ player: target, sellerId: "sel", humanId: "hum", profiles, squadOf: () => buyer, windowOpen: () => false })).toEqual([]);
  });

  test("a rival with a 3-day deadline, never past the window; cap per target", () => {
    const rival = rollRival({
      player: target, seller, candidates: [{ squad: buyer, urgency: 1 }], existing: [], date: "2027-06-10",
      closesOn: () => "2027-06-11", rng: () => 0.01,
    })!;
    expect(rival.clubId).toBe("buy");
    expect(rival.deadline).toBe("2027-06-11");
    expect(rival.fee).toBeGreaterThan(0);
    expect(rival.sellerAccepts).toBe(respondToOffer({ player: target, seller, fee: rival.fee }).kind === "accept");
    const full = [rival, { ...rival, clubId: "x" }];
    expect(rollRival({ player: target, seller, candidates: [{ squad: buyer, urgency: 1 }], existing: full, date: "2027-06-10", rng: () => 0.01 })).toBeNull();
    expect(rollRival({ player: target, seller, candidates: [{ squad: buyer, urgency: 1 }], existing: [], date: "2027-06-10", rng: () => 0.99 })).toBeNull();
  });

  test("floor: best accepted rival × 1,05; live rivals by deadline", () => {
    const r = (fee: number, sellerAccepts: boolean, deadline = "2027-06-12"): RivalBid => ({
      playerId: "p", playerName: "p", fromClubId: "s", clubId: `c${fee}`, clubName: "c", fee, wage: 1, date: "2027-06-09", deadline, sellerAccepts,
    });
    expect(rivalFloor([r(10_000_000, true), r(20_000_000, false)])).toBe(11_000_000);
    expect(rivalFloor([r(20_000_000, false)])).toBe(0);
    expect(liveRivals([r(1, true, "2027-06-09"), r(2, true, "2027-06-12")], "p", "2027-06-10").length).toBe(1);
  });

  test("preference: wage, prestige, chance of starting; ties to prestige", () => {
    expect(preferenceScore({ wage: 2, demand: 1, prestige: 0, starter: 0 })).toBeCloseTo(0.45 * 1.5);
    const a = { id: "a", pref: { wage: 100, demand: 100, prestige: 0.8, starter: 1 } };
    const b = { id: "b", pref: { wage: 140, demand: 100, prestige: 0.2, starter: 0 } };
    expect(preferredClub([a, b])!.winner.id).toBe("a");
    const c = { id: "c", pref: { wage: 100, demand: 100, prestige: 0.5, starter: 1 } };
    const d = { id: "d", pref: { wage: 100, demand: 100, prestige: 0.6, starter: 0.5 } };
    expect(preferredClub([c, { ...d, pref: { ...d.pref, starter: 1 } }])!.winner.id).toBe("d");
  });

  test("preference: poor facilities of the human club cost up to 0.10", () => {
    const base = { wage: 100, demand: 100, prestige: 0.5, starter: 0.5 };
    expect(preferenceScore({ ...base, facilitiesAppeal: 25 })).toBeCloseTo(preferenceScore(base) - 0.05, 10);
    expect(preferenceScore({ ...base, facilitiesAppeal: 80 })).toBeCloseTo(preferenceScore(base), 10);
    const human = { id: "h", pref: { ...base, facilitiesAppeal: 0 } };
    const rival = { id: "r", pref: { ...base, prestige: 0.45 } };
    expect(preferredClub([human, rival])).toMatchObject({ winner: { id: "r" }, reason: "facilities" });
  });

  test("starter chance: a star starts, a weak player sits", () => {
    const strong = player("star", 9, 25, "CM");
    const weak = player("weak", 2, 25, "CM");
    expect(starterChance(strong, buyer)).toBe(1);
    expect(starterChance(weak, buyer)).toBe(0);
  });
});

describe("pre-contracts", () => {
  const human = squad("hum", 6, { financialTier: undefined, aiTransferBudget: undefined });
  const current = squad("cur", 6);
  const ending = { ...current.players.find((p) => p.positions[0] === "CM")!, contract: { until: "2027-05-31", wage: 20_000 } };
  const cur = { ...current, players: current.players.map((p) => (p.id === ending.id ? ending : p)) };

  test("eligible within 183 days of the contract end", () => {
    expect(preContractEligible(ending, "2027-01-10")).toBe(true);
    expect(preContractEligible(ending, "2026-10-01")).toBe(false);
    expect(preContractEligible({ ...ending, loan: { fromClubId: "x", fromClubName: "x", until: "2027-05-31", wageShare: 1 } }, "2027-01-10")).toBe(false);
  });

  test("terms first, then the human must beat the renewal", () => {
    const base = { player: ending, human, current: cur, date: "2027-01-10", nextSeasonEnd: "2028-05-31" };
    const low = answerPreContract({ ...base, offer: { wage: 1, years: 2 }, humanPrestige: 0.5, currentPrestige: 0.5 });
    expect(low).toMatchObject({ accepted: false, reason: "lowWage" });
    const rich = answerPreContract({ ...base, offer: { wage: 10_000_000, years: 2 }, humanPrestige: 0.9, currentPrestige: 0.1 });
    expect(rich.accepted).toBe(true);
    expect(answerPreContract({ ...base, date: "2026-10-01", offer: { wage: 10_000_000, years: 2 }, humanPrestige: 0.9, currentPrestige: 0.1 }))
      .toMatchObject({ accepted: false, reason: "notEligible" });
  });

});

describe("personality: an AI club buying from a much bigger club (`personality.md`)", () => {
  const eliteFin = { broadcasting: 300_000_000, commercial: 0, total: 300_000_000, budget: 0, followers: 1_000_000 };
  const lowFin = { broadcasting: 5_000_000, commercial: 0, total: 5_000_000, budget: 0, followers: 1_000_000 };
  const traits = (ambition: number) => ({ ambition, loyalty: 10.5, professionalism: 10.5, temperament: 10.5 });
  const seller = squad("sel", 6, { finances: eliteFin });
  const small = squad("buy", 6, { finances: lowFin, aiTransferBudget: 500_000_000 });
  const base = seller.players.find((p) => p.positions[0] === "CM")!;
  const profiles = { buy: need("Midfielder", 5, 7) };

  test("rival candidates: a very ambitious target never lists the small club", () => {
    const cand = (ambition: number) => rivalCandidates({
      player: { ...base, personality: traits(ambition) }, sellerId: "sel", humanId: "hum", profiles,
      squadOf: (id) => (id === "buy" ? small : id === "sel" ? seller : null),
    }).map((c) => c.squad.id);
    expect(cand(20)).toEqual([]);
    expect(cand(10)).toEqual(["buy"]);
  });

  test("AI bid for the human's player: none from a club two tiers smaller when he is very ambitious", async () => {
    const { buildAiTransferBid } = await import("@/Domain/negotiation/bids");
    const bid = (ambition: number) => buildAiTransferBid({
      id: "b", player: { ...base, personality: traits(ambition) }, buyer: small, seller, date: "2027-06-10", rng: () => 0.5,
    });
    expect(bid(20)).toBeNull();
    expect(bid(10)).not.toBeNull();
  });
});
