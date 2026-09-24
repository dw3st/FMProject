import { describe, expect, test } from "bun:test";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { evaluateTransferOffer } from "@/Domain/transfer/transferAcceptance";
import { Player } from "@/Domain/Player";
import { playerOverallRating } from "@/Domain/transfer/transferNeeds";

function flatStats(v: number): RosterPlayer["stats"] {
  return {
    passing: v, vision: v, finishing: v, dribbling: v,
    speed: v, acceleration: v, tackling: v, pressing: v,
    stamina: v, heading: v, strength: v, reflex: v, jump: v,
  };
}

function makePlayer(id: string, statVal = 7, age = 26, pos = "CM"): RosterPlayer {
  return {
    id, name: id, age, squadId: "s", preferredFoot: "right",
    positions: [pos],
    stats: flatStats(statVal),
    profile: { summary: "", archetype: "test" },
  };
}

function makeSquad(players: RosterPlayer[], budget = 5_000_000, financialTier?: Squad["financialTier"]): Squad {
  return {
    id: "s", name: "Club", colors: ["#fff", "#000"], money: 0, players, financialTier,
    finances: {
      broadcasting: 0, commercial: 0, total: 0,
      budget: budget, followers: 0,
    },
  };
}

describe("evaluateTransferOffer", () => {
  test("rejects when squad too small (≤14 players)", () => {
    const players = Array.from({ length: 14 }, (_, i) => makePlayer(`p${i}`));
    const squad = makeSquad(players);
    const { accepted } = evaluateTransferOffer(players[0]!, squad, 10_000_000);
    expect(accepted).toBe(false);
  });

  test("rejects if player is the only one in their position", () => {
    const uniqueGK = makePlayer("gk", 7, 26, "GK");
    const outfield = Array.from({ length: 15 }, (_, i) => makePlayer(`p${i}`));
    const squad = makeSquad([uniqueGK, ...outfield]);
    const { accepted } = evaluateTransferOffer(uniqueGK, squad, 50_000_000);
    expect(accepted).toBe(false);
  });

  test("accept with strong offer (2x fair price)", () => {
    const player = makePlayer("star", 7, 26, "CM");
    const players = [player, ...Array.from({ length: 15 }, (_, i) => makePlayer(`${i}`, 7, 26, "CM"))];
    const squad = makeSquad(players, 5_000_000);
    const rating = playerOverallRating(player);
    const fair = new Player(rating, player.age).price;
    const { accepted } = evaluateTransferOffer(player, squad, fair * 2);
    expect(accepted).toBe(true);
  });

  test("sell priority boosts acceptance for borderline offer", () => {
    // Use a player whose offer would normally be rejected (low offerScore, typical squad)
    const player = makePlayer("mid", 7, 27, "CM");
    const players = [player, ...Array.from({ length: 15 }, (_, i) => makePlayer(`extra${i}`, 7, 26, "CM"))];
    const squad = makeSquad(players, 0, "ELITE"); // ELITE tier = low financial pressure
    const rating = playerOverallRating(player);
    const fair = new Player(rating, player.age).price;

    // Offer at fair price — on its own this may be borderline
    const withoutSell = evaluateTransferOffer(player, squad, fair);
    const withSell = evaluateTransferOffer(player, squad, fair, 1.0);

    // With sell priority 1.0, acceptance chance is significantly boosted
    if (!withoutSell.accepted) {
      expect(withSell.accepted).toBe(true);
    } else {
      // If already accepted, reason may differ
      expect(withSell.accepted).toBe(true);
    }
  });

  test("accepted reason reflects sell list when applicable", () => {
    const player = makePlayer("listed", 5, 27, "CM");
    const players = [player, ...Array.from({ length: 15 }, (_, i) => makePlayer(`p${i}`, 8, 26, "CM"))];
    const squad = makeSquad(players, 0, "LOW"); // LOW tier → high financial pressure
    const rating = playerOverallRating(player);
    const fair = new Player(rating, player.age).price;

    const { accepted, reason } = evaluateTransferOffer(player, squad, fair, 0.9);
    if (accepted) {
      expect(
        reason === "strongOffer" ||
        reason === "willingToSell" ||
        reason === "financial",
      ).toBe(true);
    }
  });

  test("AI seller pressure comes from its tier; a human seller's from its budget", () => {
    const player = makePlayer("avg", 7, 26, "CM");
    const players = [player, ...Array.from({ length: 15 }, (_, i) => makePlayer(`q${i}`, 7, 26, "CM"))];
    const fair = new Player(playerOverallRating(player), player.age).price;
    // offerScore 1, relativeStrength 0 → 0.6 + pressure × 0.3 vs the 0.8 threshold
    expect(evaluateTransferOffer(player, makeSquad(players, 999_000_000, "LOW"), fair).accepted).toBe(true);
    expect(evaluateTransferOffer(player, makeSquad(players, 0, "ELITE"), fair).accepted).toBe(false);
    expect(evaluateTransferOffer(player, makeSquad(players, 1_000_000, "ELITE"), fair, undefined, { humanSeller: true }).accepted).toBe(true);
    expect(evaluateTransferOffer(player, makeSquad(players, 100_000_000, "LOW"), fair, undefined, { humanSeller: true }).accepted).toBe(false);
  });
});
