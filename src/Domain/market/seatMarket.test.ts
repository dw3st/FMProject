import { describe, expect, test } from "bun:test";
import { emptySeatMarket, joinMarket, splitMarket } from "@/Domain/market/seatMarket";
import type { MarketState } from "@/types/transferMarketTypes";

describe("seat market: join and split", () => {
  test("join of nothing is null; world or seat alone fills the other side", () => {
    expect(joinMarket(null, null)).toBeNull();
    const fromSeat = joinMarket(null, { playerSellList: [{ playerId: "p1", priority: 1 }] })!;
    expect(fromSeat.shuffledTeamIds).toEqual([]);
    expect(fromSeat.playerSellList).toHaveLength(1);
    const fromWorld = joinMarket({ shuffledTeamIds: ["a"], rotationIndex: 1, profiles: {} }, null)!;
    expect(fromWorld.playerSellList).toEqual([]);
    expect(fromWorld.rotationIndex).toBe(1);
  });

  test("split separates the world rotation from the human fields", () => {
    const market: MarketState = {
      shuffledTeamIds: ["a", "b"], rotationIndex: 1, profiles: {},
      playerSellList: [{ playerId: "p1", priority: 1 }], playerLoanList: ["p2"], talks: {},
    };
    const { world, seat } = splitMarket(market);
    expect(world).toEqual({ shuffledTeamIds: ["a", "b"], rotationIndex: 1, profiles: {} });
    expect(seat).toEqual({ playerSellList: [{ playerId: "p1", priority: 1 }], playerLoanList: ["p2"], talks: {} });
    expect(joinMarket(world, seat)).toEqual(market);
  });

  test("an empty seat market has an empty sell list", () => {
    expect(emptySeatMarket()).toEqual({ playerSellList: [] });
  });
});
