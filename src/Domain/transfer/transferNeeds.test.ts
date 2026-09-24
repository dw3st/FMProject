import { describe, expect, test } from "bun:test";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import {
  budgetTierFromBudget,
  findCandidates,
  generateTransferNeeds,
  playerOverallRating,
  PRICE_CAP_LOW,
  processTeamTransferAttempt,
  scoreCandidate,
  teamAvgRating,
} from "@/Domain/transfer/transferNeeds";
import { Player } from "@/Domain/Player";

function basePlayer(overrides: Partial<RosterPlayer> & Pick<RosterPlayer, "id" | "name">): RosterPlayer {
  return {
    age: 25,
    squadId: "s1",
    preferredFoot: "right",
    positions: ["CM"],
    stats: {
      passing: 10,
      vision: 10,
      finishing: 10,
      dribbling: 10,
      speed: 10,
      acceleration: 10,
      tackling: 10,
      pressing: 10,
      stamina: 10,
      heading: 10,
      strength: 10,
      reflex: 10,
      jump: 10,
    },
    profile: { summary: "", archetype: "test" },
    ...overrides,
  };
}

function makeSquad(id: string, players: RosterPlayer[], finances?: Squad["finances"]): Squad {
  return {
    id,
    name: "Test FC",
    colors: ["#fff", "#000"],
    money: 0,
    players,
    leagueSlug: "test_league",
    slug: id,
    finances,
  };
}

describe("budgetTierFromBudget", () => {
  test("high >= 50M", () => {
    expect(budgetTierFromBudget(50_000_000)).toBe("high");
    expect(budgetTierFromBudget(100_000_000)).toBe("high");
  });
  test("mid 15M–50M", () => {
    expect(budgetTierFromBudget(15_000_000)).toBe("mid");
    expect(budgetTierFromBudget(40_000_000)).toBe("mid");
  });
  test("low < 15M", () => {
    expect(budgetTierFromBudget(14_999_999)).toBe("low");
    expect(budgetTierFromBudget(0)).toBe("low");
  });
});

describe("generateTransferNeeds", () => {
  test("GK depth < 2 produces high urgency need", () => {
    const rng = () => 0.5;
    const players: RosterPlayer[] = [
      basePlayer({ id: "gk1", name: "G", positions: ["GK"] }),
      ...Array.from({ length: 15 }, (_, i) =>
        basePlayer({ id: `p${i}`, name: `P${i}`, positions: ["CM"] }),
      ),
    ];
    const squad = makeSquad("t1", players, { budget: 60_000_000 } as Squad["finances"]);
    const profile = generateTransferNeeds(squad, "2025-01-01", rng);
    const gkNeed = profile.needs.find((n) => n.position === "GK");
    expect(gkNeed).toBeDefined();
    expect(gkNeed!.urgency).toBeGreaterThanOrEqual(0.3);
  });

  test("low budget → lower targetMax than high budget (same rng)", () => {
    const rng = () => 0.5;
    const players = [
      basePlayer({ id: "gk1", name: "G1", positions: ["GK"] }),
      basePlayer({ id: "gk2", name: "G2", positions: ["GK"] }),
      ...Array.from({ length: 14 }, (_, i) =>
        basePlayer({ id: `p${i}`, name: `P${i}`, positions: ["CM"] }),
      ),
    ];
    const low = generateTransferNeeds(
      makeSquad("a", players, { budget: 5_000_000 } as Squad["finances"]),
      "2025-01-01",
      rng,
    );
    const high = generateTransferNeeds(
      makeSquad("b", players, { budget: 60_000_000 } as Squad["finances"]),
      "2025-01-01",
      rng,
    );
    const lowMid = low.needs.map((n) => (n.targetMin + n.targetMax) / 2);
    const highMid = high.needs.map((n) => (n.targetMin + n.targetMax) / 2);
    expect(Math.max(...lowMid)).toBeLessThan(Math.max(...highMid));
  });

  test("jitter: different rng seeds change urgency", () => {
    const players = [
      basePlayer({ id: "gk1", name: "G", positions: ["GK"] }),
      ...Array.from({ length: 16 }, (_, i) =>
        basePlayer({ id: `p${i}`, name: `P${i}`, positions: ["CM"] }),
      ),
    ];
    const squad = makeSquad("t", players, { budget: 60_000_000 } as Squad["finances"]);
    const p1 = generateTransferNeeds(squad, "2025-01-01", () => 0.1);
    const p2 = generateTransferNeeds(squad, "2025-01-01", () => 0.99);
    const u1 = p1.needs.find((n) => n.position === "GK")?.urgency ?? 0;
    const u2 = p2.needs.find((n) => n.position === "GK")?.urgency ?? 0;
    expect(u1).not.toBe(u2);
  });
});

describe("findCandidates", () => {
  test("low tier rejects player above price cap", () => {
    const rating = 8;
    const expensive = basePlayer({
      id: "exp",
      name: "Star",
      positions: ["ST"],
      stats: Object.fromEntries(
        Object.keys(basePlayer({ id: "x", name: "x" }).stats).map((k) => [k, 18]),
      ) as unknown as RosterPlayer["stats"],
    });
    const seller = makeSquad("sell", [expensive]);
    const price = new Player(playerOverallRating(expensive), expensive.age).price;
    expect(price).toBeGreaterThan(PRICE_CAP_LOW);

    const need = {
      position: "Forward" as const,
      targetMin: 5,
      targetMax: 10,
      urgency: 1,
      budgetTier: "low" as const,
      intentType: "cover_need" as const,
    };
    const c = findCandidates(need, [seller, makeSquad("buy", [])], "buy");
    expect(c.length).toBe(0);
  });

  test("excludes seller squad when excludeSellerSquadId is set", () => {
    const cm = basePlayer({ id: "cm", name: "CM", positions: ["CM"] });
    const seller = makeSquad("sell", [cm]);
    const need = {
      position: "Midfielder" as const,
      targetMin: 5,
      targetMax: 10,
      urgency: 1,
      budgetTier: "high" as const,
      intentType: "cover_need" as const,
    };
    const withSeller = findCandidates(need, [seller, makeSquad("buy", [])], "buy");
    const withoutSeller = findCandidates(need, [seller, makeSquad("buy", [])], "buy", "sell");
    expect(withSeller.length).toBe(1);
    expect(withoutSeller.length).toBe(0);
  });

  test("high tier has no price cap for expensive player", () => {
    const expensive = basePlayer({
      id: "exp",
      name: "Star",
      positions: ["ST"],
      stats: Object.fromEntries(
        Object.keys(basePlayer({ id: "x", name: "x" }).stats).map((k) => [k, 18]),
      ) as unknown as RosterPlayer["stats"],
    });
    const seller = makeSquad("sell", [expensive]);
    const need = {
      position: "Forward" as const,
      targetMin: 5,
      targetMax: 20,
      urgency: 1,
      budgetTier: "high" as const,
      intentType: "cover_need" as const,
    };
    const c = findCandidates(need, [seller, makeSquad("buy", [])], "buy");
    expect(c.length).toBe(1);
  });
});

describe("scoreCandidate", () => {
  test("noise: same inputs different rng → different score", () => {
    const need = {
      position: "Midfielder" as const,
      targetMin: 6,
      targetMax: 8,
      urgency: 0.8,
      budgetTier: "mid" as const,
      intentType: "cover_need" as const,
    };
    const p = basePlayer({ id: "p", name: "P", positions: ["CM"] });
    const fee = 5_000_000;
    const budget = 30_000_000;
    const s1 = scoreCandidate(p, need, fee, budget, () => 0.1);
    const s2 = scoreCandidate(p, need, fee, budget, () => 0.9);
    expect(s1).not.toBe(s2);
  });

  test("sell-listed player scores higher than non-listed identical player", () => {
    const need = {
      position: "Midfielder" as const,
      targetMin: 5,
      targetMax: 9,
      urgency: 0.8,
      budgetTier: "mid" as const,
      intentType: "cover_need" as const,
    };
    const p = basePlayer({ id: "p1", name: "P", positions: ["CM"] });
    const fee = 5_000_000;
    const budget = 30_000_000;
    const rng = () => 0.5;
    const withoutSell = scoreCandidate(p, need, fee, budget, rng, []);
    const withSell = scoreCandidate(p, need, fee, budget, rng, [{ playerId: "p1", priority: 0.8 }]);
    expect(withSell).toBeGreaterThan(withoutSell);
  });
});

describe("processTeamTransferAttempt", () => {
  test("fee varies vs fair price", () => {
    const rng = () => 0.5;
    const sellerPlayer = basePlayer({ id: "sp", name: "Sell", positions: ["ST"], squadId: "sell" });
    const fair = new Player(playerOverallRating(sellerPlayer), sellerPlayer.age).price;
    const seller = makeSquad("sell", [sellerPlayer]);
    const buyer = makeSquad(
      "buy",
      Array.from({ length: 20 }, (_, j) =>
        basePlayer({ id: `b${j}`, name: `B${j}`, positions: ["CM"] }),
      ),
      {
        broadcasting: 0,
        commercial: 0,
        total: 0,
        budget: 200_000_000,
        followers: 0,
      },
    );
    const rating = playerOverallRating(sellerPlayer);
    const profile = {
      squadId: buyer.id,
      lastUpdateDay: "2025-01-01",
      sellList: [],
      needs: [
        {
          position: "Forward" as const,
          targetMin: rating - 0.5,
          targetMax: rating + 0.5,
          urgency: 1,
          budgetTier: "high" as const,
          intentType: "cover_need" as const,
        },
      ],
    };
    const attempt = processTeamTransferAttempt(buyer, profile, [seller, buyer], rng);
    expect(attempt).not.toBeNull();
    expect(attempt!.fee).toBe(Math.round(fair * (0.9 + 0.5 * 0.25)));
    expect(attempt!.fulfilledNeed.position).toBe("Forward");
  });

  test("rejects when fee exceeds buyer transfer budget", () => {
    const rng = () => 0.5;
    const star = basePlayer({
      id: "star",
      name: "Star",
      positions: ["ST"],
      stats: Object.fromEntries(
        Object.keys(basePlayer({ id: "x", name: "x" }).stats).map((k) => [k, 18]),
      ) as unknown as RosterPlayer["stats"],
    });
    const seller = makeSquad("sell", [star]);
    const buyer = makeSquad(
      "buy",
      Array.from({ length: 20 }, (_, j) =>
        basePlayer({ id: `b${j}`, name: `B${j}`, positions: ["CM"] }),
      ),
      {
        broadcasting: 0,
        commercial: 0,
        total: 0,
        budget: 1_000,
        followers: 0,
      },
    );
    const profile = generateTransferNeeds(buyer, "2025-01-01", rng);
    const attempt = processTeamTransferAttempt(buyer, profile, [seller, buyer], rng);
    expect(attempt).toBeNull();
  });

  test("does not buy from excluded player club", () => {
    const rng = () => 0.5;
    const sellerPlayer = basePlayer({ id: "sp", name: "Sell", positions: ["ST"], squadId: "human" });
    const seller = makeSquad("human", [sellerPlayer]);
    const buyer = makeSquad(
      "ai",
      Array.from({ length: 20 }, (_, j) =>
        basePlayer({ id: `b${j}`, name: `B${j}`, positions: ["CM"] }),
      ),
      {
        broadcasting: 0,
        commercial: 0,
        total: 0,
        budget: 200_000_000,
        followers: 0,
      },
    );
    const rating = playerOverallRating(sellerPlayer);
    const profile = {
      squadId: buyer.id,
      lastUpdateDay: "2025-01-01",
      sellList: [],
      needs: [
        {
          position: "Forward" as const,
          targetMin: rating - 0.5,
          targetMax: rating + 0.5,
          urgency: 1,
          budgetTier: "high" as const,
          intentType: "cover_need" as const,
        },
      ],
    };
    const attempt = processTeamTransferAttempt(buyer, profile, [seller, buyer], rng, "human");
    expect(attempt).toBeNull();
  });
});

describe("teamAvgRating", () => {
  test("empty squad returns 5", () => {
    expect(teamAvgRating(makeSquad("e", []))).toBe(5);
  });
});
