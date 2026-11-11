import { FAME, assetsValue, fameBand, fameReputation } from "@/Domain/managers/assets";
import { fameDemandMult } from "@/Domain/personality/personality";
import { describe, expect, test } from "bun:test";
import { ASSET_PRICES, assetRefusal, isAssetKind, managerWallet, nextAssetPrice, nextEarningGoal } from "@/Domain/managers/assets";

describe("manager's money", () => {
  test("the wallet is what was earned minus what was spent", () => {
    expect(managerWallet(1_000_000, 300_000)).toBe(700_000);
    expect(managerWallet(undefined, undefined)).toBe(0);
    expect(managerWallet(100, 500)).toBe(0);
    expect(managerWallet(1_000, 100, 50, 200)).toBe(750);
    expect(managerWallet(1_000, 100, -2_000, 0)).toBe(0);
  });

  test("levels go one by one, up to the top", () => {
    expect(nextAssetPrice(undefined, "home")).toBe(ASSET_PRICES.home[0]!);
    expect(nextAssetPrice({ home: 2 }, "home")).toBe(ASSET_PRICES.home[2]!);
    expect(nextAssetPrice({ car: 4 }, "car")).toBe(ASSET_PRICES.car[4]!);
    expect(nextAssetPrice({ car: 5 }, "car")).toBeNull();
  });

  test("refusals", () => {
    expect(assetRefusal({}, "watch", 10_000)).toBeNull();
    expect(assetRefusal({}, "watch", 9_999)).toBe("noMoney");
    expect(assetRefusal({ watch: 5 }, "watch", 99_000_000)).toBe("maxLevel");
    expect(isAssetKind("yacht")).toBe(false);
  });

  test("the next goal, from the wage on offer", () => {
    expect(nextEarningGoal(0, 10_000)).toEqual({ goal: 1_000_000, missing: 1_000_000, seasons: 2 });
    expect(nextEarningGoal(1_000_000, 100_000)).toEqual({ goal: 10_000_000, missing: 9_000_000, seasons: 2 });
    expect(nextEarningGoal(50_000_000, 100_000)).toBeNull();
    expect(nextEarningGoal(0, 0)).toBeNull();
  });
});

describe("fame from the belongings (8.9.39)", () => {
  test("value of the levels owned, reputation with a shrinking gain, bands", () => {
    expect(assetsValue(undefined)).toBe(0);
    expect(fameReputation(undefined)).toBe(0);
    expect(fameBand(undefined)).toBe(0);
    expect(assetsValue({ home: 2, car: 1 })).toBe(300_000 + 1_500_000 + 50_000);
    const all = { home: 5, car: 5, watch: 5, boat: 5, plane: 5, suit: 5, art: 5 };
    expect(fameReputation(all)).toBeLessThanOrEqual(FAME.MAX_REPUTATION);
    expect(fameReputation(all)).toBeGreaterThan(4.9);
    expect(fameBand(all)).toBe(4);
    expect(fameReputation({ boat: 3 })).toBeGreaterThan(fameReputation({ boat: 2 }));
  });

  test("ambitious players ask less from a famous manager; the settled ones do not care", () => {
    const ambitious = { id: "a", personality: { ambition: 20, loyalty: 10, professionalism: 10, temperament: 10 } };
    const settled = { id: "b", personality: { ambition: 5, loyalty: 10, professionalism: 10, temperament: 10 } };
    expect(fameDemandMult(ambitious as never, 1, FAME.DEMAND_DISCOUNT)).toBeCloseTo(1 - FAME.DEMAND_DISCOUNT, 5);
    expect(fameDemandMult(ambitious as never, 0, FAME.DEMAND_DISCOUNT)).toBe(1);
    expect(fameDemandMult(settled as never, 1, FAME.DEMAND_DISCOUNT)).toBe(1);
  });
});
