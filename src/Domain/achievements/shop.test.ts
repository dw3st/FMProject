import { describe, expect, test } from "bun:test";
import { careerInGame, isLegend, legendExtraPrice, legendOffer, legendRarity, recordPurchase, shopPrice } from "@/Domain/achievements/shop";
import { ACHIEVEMENTS as A } from "@/Domain/achievements/achievementsConfig";
import type { AchievementsState } from "@/types/achievementTypes";
import { closeSeasonForPlayers, withPeakLevel } from "@/Domain/history/history";
import type { RetiredPlayer, RosterPlayer } from "@/types/playerTypes";

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
const crowd = (n: number) => Array.from({ length: n }, (_, i) => retired(`c${i}`));

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
  test("only legends are drawn when there are enough; commons only complete a short list", () => {
    const list = [...crowd(20), ...Array.from({ length: 200 }, (_, i) => common(`x${i}`, { statsAtRetirement: stats(5) }))];
    expect(offer(list).every((id) => id.startsWith("c"))).toBe(true);
    const few = [...crowd(3), ...Array.from({ length: 30 }, (_, i) => common(`x${i}`))];
    expect(offer(few).filter((id) => id.startsWith("c"))).toHaveLength(3);
    expect(offer(few)).toHaveLength(A.LEGEND_OFFER.SIZE);
  });
  test("the rarest come first", () => {
    const list = legendOffer([common("c"), retired("w")], O);
    expect(list[0]!.id).toBe("w");
  });
});

describe("career-best level", () => {
  const player = (v: number, peakLevel?: number) => ({
    id: "p", name: "P", age: 30, positions: ["CM"], stats: stats(v), ...(peakLevel !== undefined ? { peakLevel } : {}),
  }) as unknown as RosterPlayer;
  test("grows with the player and never falls", () => {
    expect(withPeakLevel(player(5)).peakLevel).toBe(5);
    expect(withPeakLevel(player(6, 5)).peakLevel).toBe(6);
    const declined = player(4, 5);
    expect(withPeakLevel(declined)).toBe(declined);
  });
  test("the rollover writes it", () => {
    const [p] = closeSeasonForPlayers([player(5)], {}, { squadId: "s", clubName: "c", league: "l" } as never, "2027", {});
    expect(p!.peakLevel).toBe(5);
  });
});

describe("who is a legend", () => {
  const row = (titles: string[], awards: { kind: string }[] = [], apps = 30) =>
    ({ season: "2027", squadId: "s", clubName: "c", league: "l", apps, goals: 0, assists: 0, avgRating: 6, cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles, awards });
  const at = (pos: string, v: number, extra: Partial<RetiredPlayer> = {}) => common(pos, { positions: [pos], statsAtRetirement: stats(v), ...extra });
  const played = (apps: number, titles: string[] = []) => ({ history: [row(titles, [], apps)] }) as Partial<RetiredPlayer>;
  test("the cut depends on the line: a level that makes an attacker a legend does not make a defender one", () => {
    expect(isLegend(at("Forward", 4.45, played(150)))).toBe(true);
    expect(isLegend(at("Defender", 4.45, played(150)))).toBe(false);
    expect(isLegend(at("Defender", 4.85, played(150)))).toBe(true);
  });
  test("the best level of his career counts, not only the one he retired with", () => {
    expect(isLegend(at("Forward", 3.2, played(150)))).toBe(false);
    expect(isLegend(at("Forward", 3.2, { peakLevel: 5, ...played(150) }))).toBe(true);
  });
  test("by level he also needs a career in the game: 150 games or a title (report: level 50, 33 games)", () => {
    expect(isLegend(at("Defender", 5.0, played(33)))).toBe(false);
    expect(isLegend(at("Defender", 5.0))).toBe(false);
    expect(isLegend(at("Defender", 5.0, played(33, ["league:a"])))).toBe(true);
    expect(isLegend(at("Defender", 5.0, played(149)))).toBe(false);
    expect(isLegend(at("Defender", 5.0, { wasWorldClass: true }))).toBe(true);
  });
  test("a career in the game counts, with a decent level", () => {
    const h = (rows: unknown[]) => ({ history: rows }) as Partial<RetiredPlayer>;
    expect(isLegend(at("Defender", 4.2, h([row(["league:a", "cup:b", "league:c"])])))).toBe(true);
    expect(isLegend(at("Defender", 4.2, h([row([], [{ kind: "team_of_season" }, { kind: "team_of_season" }])])))).toBe(true);
    expect(isLegend(at("Defender", 4.2, h([row([], [{ kind: "best_player" }])])))).toBe(true);
    expect(isLegend(at("Defender", 4.2, h([row([], [], 300)])))).toBe(true);
    expect(isLegend(at("Defender", 4.2, h([row(["league:a"], [], 100)])))).toBe(false);
    expect(isLegend(at("Defender", 3.5, h([row(["league:a", "cup:b", "league:c"])])))).toBe(false);
  });
  test("a national title counts as a title", () => {
    expect(careerInGame(at("Defender", 4.2, { national: { nation: "x", caps: 1, goals: 0, assists: 0, titles: ["wc_2030"] } })).titles).toBe(1);
  });
  test("a free agent never is", () => {
    expect(isLegend(at("Forward", 6, { freeAgent: true }))).toBe(false);
  });
});

describe("legend rarity and price", () => {
  test("rarity by world class and level", () => {
    expect(legendRarity(retired("w"))).toBe("super");
    const career = { history: [{ season: "2027", squadId: "s", clubName: "c", league: "l", apps: 150, goals: 0, assists: 0, avgRating: 6, cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [] }] } as unknown as Partial<RetiredPlayer>;
    expect(legendRarity(common("t", { statsAtRetirement: stats(5.6), ...career }))).toBe("super");
    expect(legendRarity(common("t", { statsAtRetirement: stats(5.6) }))).toBe("common");
    expect(legendRarity(common("l", { statsAtRetirement: stats(4.5), ...career }))).toBe("rare");
    expect(legendRarity(common("n", { statsAtRetirement: stats(3.6) }))).toBe("common");
  });
  test("a rare one costs more, and that is what the purchase spends", () => {
    const rare = common("l", { statsAtRetirement: stats(4.5), history: [{ season: "2027", squadId: "s", clubName: "c", league: "l", apps: 150, goals: 0, assists: 0, avgRating: 6, cupApps: 0, cupGoals: 0, contApps: 0, contGoals: 0, yellowCards: 0, redCards: 0, injuries: 0, daysInjured: 0, titles: [] }] } as unknown as Partial<RetiredPlayer>);
    expect(legendExtraPrice(rare)).toBe(A.LEGEND_OFFER.EXTRA.rare);
    const state = { spent: 0, bought: {} } as unknown as AchievementsState;
    const after = recordPurchase(state, "legend", "2030-09-01", O.season, { id: "x", name: "x", positions: ["CM"] }, legendExtraPrice(rare));
    expect(after.spent).toBe(shopPrice(state, "legend") + A.LEGEND_OFFER.EXTRA.rare);
  });
});
