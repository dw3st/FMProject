import { describe, expect, test } from "bun:test";
import { aiClubFinance } from "@/Domain/aiFinance/aiClubFinance";
import { withContracts } from "@/Domain/contracts/contracts";
import { squadsAfterAcceptedTransfer } from "@/Domain/transfer/transferAcceptance";
import { squadWeeklyWages } from "@/Domain/finance/wages";
import type { RosterPlayer, Squad } from "@/types/playerTypes";

function player(id: string, age = 25): RosterPlayer {
  const v = 5;
  return {
    id, name: id, age, squadId: "a", preferredFoot: "right", positions: ["CM"],
    stats: {
      passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v,
      tackling: v, pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
    },
    profile: { summary: "" } as RosterPlayer["profile"],
  };
}

function squad(id: string, players: RosterPlayer[]): Squad {
  return {
    id, name: id, colors: ["#000", "#fff"], money: 0, players,
    finances: { broadcasting: 10_000_000, commercial: 5_000_000, total: 15_000_000, budget: 0, followers: 0 },
    venue: { name: "A", city: "C", capacity: 40_000, surface: "grass" },
    wageFactor: 1, wageRevenueBasis: 20_000_000,
  };
}

describe("contracts in the world", () => {
  test("withContracts fills every player and leaves existing ones", () => {
    const keep = { ...player("k"), contract: { until: "2030-05-31", wage: 7 } };
    const s = withContracts(squad("a", [keep, player("x")]), "2027-05-31");
    expect(s.players[0]!.contract).toEqual({ until: "2030-05-31", wage: 7 });
    expect(s.players[1]!.contract?.until).toMatch(/^20\d\d-05-31$/);
    expect(withContracts(s, "2027-05-31")).toBe(s);
  });

  test("the wage bill (and the AI hiring state) sums contract wages", () => {
    const s = squad("a", [player("x"), player("y")]);
    const cheap = { ...s, players: s.players.map((p) => ({ ...p, contract: { until: "2027-05-31", wage: 1 } })) };
    expect(squadWeeklyWages(cheap.players, 1)).toBe(2);
    expect(aiClubFinance(cheap).wageBill).toBe(2);
    const dear = { ...s, players: s.players.map((p) => ({ ...p, contract: { until: "2027-05-31", wage: 10_000_000 } })) };
    expect(aiClubFinance(dear).hiring).toBe("frozen");
  });

  test("a transfer gives the player the new contract", () => {
    const p = player("x");
    const { buying, selling } = squadsAfterAcceptedTransfer(
      p, squad("a", [p]), squad("b", []), "b", "x", { until: "2029-05-31", wage: 99 },
    );
    expect(buying.players[0]!.contract).toEqual({ until: "2029-05-31", wage: 99 });
    expect(selling.players).toHaveLength(0);
  });
});
