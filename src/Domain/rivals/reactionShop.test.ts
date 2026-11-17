import { describe, expect, test } from "bun:test";
import { FREE_REACTIONS, SHOP_REACTION_IDS, ownedReactions, reactionRefusal } from "@/Domain/rivals/reactionShop";
import { REACTIONS } from "@/Domain/rivals/taunts";

describe("reactions shop", () => {
  test("every reaction is free or in the shop, once", () => {
    expect([...FREE_REACTIONS, ...SHOP_REACTION_IDS].sort()).toEqual([...REACTIONS].sort());
  });
  test("owned = free + bought + unlocked by achievements", () => {
    expect(ownedReactions(undefined, undefined)).toEqual([...FREE_REACTIONS]);
    const o = ownedReactions(["popcorn", "crown"], { "league_titles:gold": "2030-05-01", "secret:bet_longshot": "2031-01-01" });
    expect(o).toContain("popcorn");
    expect(o).toContain("crown");
    expect(o).toContain("dice");
    expect(o).not.toContain("safe");
  });
  test("purchase refusals", () => {
    expect(reactionRefusal([], "crown", 1e9)).toBe("notForSale");
    expect(reactionRefusal(["popcorn"], "popcorn", 1e9)).toBe("owned");
    expect(reactionRefusal([], "trophy", 4_999_999)).toBe("noMoney");
    expect(reactionRefusal([], "trophy", 5_000_000)).toBeNull();
  });
});
