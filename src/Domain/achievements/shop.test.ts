import { describe, expect, test } from "bun:test";
import { legendExtraPrice, legendOffer, legendRarity, recordPurchase, shopPrice } from "@/Domain/achievements/shop";
import { ACHIEVEMENTS as A } from "@/Domain/achievements/achievementsConfig";
import type { AchievementsState } from "@/types/achievementTypes";
import type { RetiredPlayer } from "@/types/playerTypes";

const stats = (v: number): RetiredPlayer["statsAtRetirement"] => ({
  passing: v, vision: v, finishing: v, dribbling: v, speed: v, acceleration: v, tackling: v,
  pressing: v, stamina: v, heading: v, strength: v, reflex: v, jump: v,
});

const retired = (id: string, extra: Partial<RetiredPlayer> = {}): RetiredPlayer => ({
  id, name: id, nationality: null, positions: ["CM"], preferredFoot: "right", profile: { summary: "", archetype: "t" },
  retiredOn: "2027-06-01", squadId: "s", age: 36, wasWorldClass: true, statsAtRetirement: stats(7), appearances: 0, goals: 0,
  ...extra,
});

const O = { saveId: "s1", seatId: "seat", season: "premier_league:2030", seasonStart: "2030-08-15" };
const offer = (list: RetiredPlayer[], o: Partial<typeof O> = {}) => legendOffer(list, { ...O, ...o }).map((r) => r.id);
const common = (id: string, extra: Partial<RetiredPlayer> = {}) => retired(id, { wasWorldClass: false, statsAtRetirement: stats(4), ...extra });
const crowd = (n: number) => Array.from({ length: n }, (_, i) => common(`c${i}`));

describe("legend offer", () => {
  test("a fixed number per season from a larger base", () => {
    expect(offer(crowd(60))).toHaveLength(A.LEGEND_OFFER.SIZE);
  });
  test("a new season brings a new list, the same season keeps it", () => {
    expect(offer(crowd(60))).toEqual(offer(crowd(60)));
    expect(offer(crowd(60), { season: "premier_league:2031" })).not.toEqual(offer(crowd(60)));
  });
  test("each manager gets his own list", () => {
    expect(offer(crowd(60), { seatId: "other" })).not.toEqual(offer(crowd(60)));
  });
  test("someone retiring during the season does not change the list", () => {
    const late = retired("late", { retiredOn: "2030-12-01" });
    expect(offer([...crowd(60), late])).toEqual(offer(crowd(60)));
  });
  test("one brought back, a reborn or a free agent is never offered; the next takes his place", () => {
    const first = offer(crowd(60))[0]!;
    const taken = crowd(60).map((r) => (r.id === first ? { ...r, legendBy: "seat-2" } : r));
    expect(offer(taken)).toHaveLength(A.LEGEND_OFFER.SIZE);
    expect(offer(taken)).not.toContain(first);
    expect(offer([retired("a"), retired("b", { rebornOffer: "accepted" }), retired("d", { freeAgent: true })])).toEqual(["a"]);
  });
  test("a young world with few retirees still shows the best ones", () => {
    const pool = Array.from({ length: 20 }, (_, i) => common(`r${i}`, { statsAtRetirement: stats(2) }));
    expect(offer(pool)).toHaveLength(A.LEGEND_OFFER.SIZE);
  });
  test("the rarest come first", () => {
    const list = legendOffer([common("c"), retired("w")], O);
    expect(list[0]!.id).toBe("w");
  });
});

describe("legend rarity and price", () => {
  test("rarity by world class and level", () => {
    expect(legendRarity(retired("w"))).toBe("super");
    expect(legendRarity(common("t", { statsAtRetirement: stats(5.6) }))).toBe("super");
    expect(legendRarity(common("l", { statsAtRetirement: stats(4.6) }))).toBe("rare");
    expect(legendRarity(common("n", { statsAtRetirement: stats(3.6) }))).toBe("common");
  });
  test("a rare one costs more, and that is what the purchase spends", () => {
    const rare = common("l", { statsAtRetirement: stats(4.6) });
    expect(legendExtraPrice(rare)).toBe(A.LEGEND_OFFER.EXTRA.rare);
    const state = { spent: 0, bought: {} } as unknown as AchievementsState;
    const after = recordPurchase(state, "legend", "2030-09-01", O.season, { id: "x", name: "x", positions: ["CM"] }, legendExtraPrice(rare));
    expect(after.spent).toBe(shopPrice(state, "legend") + A.LEGEND_OFFER.EXTRA.rare);
  });
});
