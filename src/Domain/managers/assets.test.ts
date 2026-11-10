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
    expect(nextAssetPrice({ car: 4 }, "car")).toBeNull();
  });

  test("refusals", () => {
    expect(assetRefusal({}, "watch", 10_000)).toBeNull();
    expect(assetRefusal({}, "watch", 9_999)).toBe("noMoney");
    expect(assetRefusal({ watch: 4 }, "watch", 99_000_000)).toBe("maxLevel");
    expect(isAssetKind("yacht")).toBe(false);
  });

  test("the next goal, from the wage on offer", () => {
    expect(nextEarningGoal(0, 10_000)).toEqual({ goal: 1_000_000, missing: 1_000_000, seasons: 2 });
    expect(nextEarningGoal(1_000_000, 100_000)).toEqual({ goal: 10_000_000, missing: 9_000_000, seasons: 2 });
    expect(nextEarningGoal(50_000_000, 100_000)).toBeNull();
    expect(nextEarningGoal(0, 0)).toBeNull();
  });
});
