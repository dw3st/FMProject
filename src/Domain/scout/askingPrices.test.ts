import { describe, expect, test } from "bun:test";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { askingPricesOf } from "@/Domain/scout/askingPrices";
import { respondToOffer } from "@/Domain/negotiation/negotiation";
import { playerMarketValue } from "@/Domain/negotiation/askingPrice";

function stats(v: number): RosterPlayer["stats"] {
  return {
    passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v, pressing: v,
    stamina: v, heading: v, strength: v, reflex: v, jump: v,
  };
}

function squad(id: string, v = 6): Squad {
  const mk = (n: number, pos: string, tag: string) => Array.from({ length: n }, (_, i): RosterPlayer => ({
    id: `${id}${tag}${i}`, name: `${id}${tag}${i}`, age: 26, squadId: id, preferredFoot: "right", positions: [pos],
    stats: stats(v), profile: { summary: "", archetype: "t" }, contract: { until: "2028-05-31", wage: 20_000 },
  }));
  return {
    id, name: `Club ${id}`, colors: ["#fff", "#000"], money: 0, financialTier: "MEDIUM",
    players: [...mk(4, "GK", "gk"), ...mk(9, "CB", "cb"), ...mk(9, "CM", "cm"), ...mk(6, "ST", "st")],
    finances: { broadcasting: 30_000_000, commercial: 20_000_000, total: 50_000_000, budget: 20_000_000, followers: 1_000_000 },
  };
}

describe("askingPricesOf", () => {
  const ai = squad("ai");
  const me = squad("me");
  const friend = squad("fr");

  test("an AI club asks the smallest fee it accepts, and one step less is not accepted", () => {
    const prices = askingPricesOf({
      squads: [ai, me], aiLists: { ai: { sellList: [{ playerId: "aicm0", priority: 0.3 }] } },
      seatLists: [], buyer: me, humanClubIds: new Set(["me"]),
    });
    const ask = prices.get("aicm0")!;
    const player = ai.players.find((p) => p.id === "aicm0")!;
    expect(respondToOffer({ player, seller: ai, fee: ask, sellPriority: 0.3, buyer: me }).kind).toBe("accept");
    const step = ask < 10_000_000 ? 100_000 : 1_000_000;
    expect(respondToOffer({ player, seller: ai, fee: ask - step * 3, sellPriority: 0.3, buyer: me }).kind).not.toBe("accept");
  });

  test("another manager's list: his asking price, else the value; never the buyer's own players", () => {
    const prices = askingPricesOf({
      squads: [ai, me, friend], aiLists: {},
      seatLists: [
        { clubId: "fr", list: [{ playerId: "frcm0", priority: 1, askingPrice: 12_340_000 }, { playerId: "frst0", priority: 1 }] },
        { clubId: "me", list: [{ playerId: "mecm0", priority: 1 }] },
      ],
      buyer: me, humanClubIds: new Set(["me", "fr"]),
    });
    expect(prices.get("frcm0")).toBe(13_000_000);
    expect(prices.get("frst0")).toBeGreaterThanOrEqual(playerMarketValue(friend.players.find((p) => p.id === "frst0")!));
    expect(prices.has("mecm0")).toBe(false);
  });
});
