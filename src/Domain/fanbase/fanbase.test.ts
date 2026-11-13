import { describe, expect, test } from "bun:test";
import {
  commercialAfterFollowers, FANBASE, fanbasePage, fanbaseRanking, fansDeltaOf, heatOf, seasonTrend, type FanbaseClub,
} from "@/Domain/fanbase/fanbase";

const club = (id: string, followers: number, extra: Partial<FanbaseClub> = {}): FanbaseClub => ({
  squadId: id, name: `Club ${id}`, leagueSlug: "l1", country: "England", followers, tier: "MEDIUM",
  place: { rank: 10, leagueSize: 20, played: 20 }, human: false, ...extra,
});

describe("season trend", () => {
  test("no trend before the table means anything", () => {
    expect(seasonTrend(null, "MEDIUM")).toBeNull();
    expect(seasonTrend({ rank: 1, leagueSize: 20, played: FANBASE.MIN_GAMES - 1 }, "MEDIUM")).toBeNull();
    expect(heatOf(null)).toBe("warm");
  });

  test("the leader is hot, the bottom is cold, mid-table warm", () => {
    const top = seasonTrend({ rank: 1, leagueSize: 20, played: 20 }, "MEDIUM")!;
    const mid = seasonTrend({ rank: 10, leagueSize: 20, played: 20 }, "MEDIUM")!;
    const last = seasonTrend({ rank: 20, leagueSize: 20, played: 20 }, "MEDIUM")!;
    expect(top).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(last);
    expect(heatOf(top)).toBe("hot");
    expect(heatOf(mid)).toBe("warm");
    expect(heatOf(last)).toBe("cold");
    expect(fansDeltaOf("hot")).toBeGreaterThan(0);
    expect(fansDeltaOf("warm")).toBe(0);
    expect(fansDeltaOf("cold")).toBeLessThan(0);
  });
});

describe("commercial income follows the followers", () => {
  test("half of the change, capped both ways, untouched without followers", () => {
    expect(commercialAfterFollowers(1_000_000, 100, 104)).toBe(1_020_000);
    expect(commercialAfterFollowers(1_000_000, 100, 200)).toBe(Math.round(1_000_000 * (1 + FANBASE.COMMERCIAL_CAP)));
    expect(commercialAfterFollowers(1_000_000, 100, 50)).toBe(Math.round(1_000_000 * (1 - FANBASE.COMMERCIAL_CAP)));
    expect(commercialAfterFollowers(1_000_000, 0, 50)).toBe(1_000_000);
    expect(commercialAfterFollowers(1_000_000, 100, 100)).toBe(1_000_000);
  });
});

describe("ranking and scopes", () => {
  const clubs = [
    club("a", 500), club("b", 900, { leagueSlug: "l2" }), club("c", 700, { country: "Spain", leagueSlug: "es" }),
    club("d", 900, { name: "Alpha" }), club("me", 300, { human: true }),
  ];

  test("by followers, then name; numbered from 1", () => {
    const rows = fanbaseRanking(clubs);
    expect(rows.map((r) => r.squadId)).toEqual(["d", "b", "c", "a", "me"]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(rows[4]!.human).toBe(true);
  });

  test("country and league scopes are those of the viewer's club, re-numbered", () => {
    const country = fanbasePage(clubs, { scope: "country", myClubId: "me", offset: 0, limit: 10 });
    expect(country.items.map((r) => r.squadId)).toEqual(["d", "b", "a", "me"]);
    expect(country.mine?.rank).toBe(4);
    const league = fanbasePage(clubs, { scope: "league", myClubId: "me", offset: 0, limit: 10 });
    expect(league.items.map((r) => r.squadId)).toEqual(["d", "a", "me"]);
    expect(league.total).toBe(3);
  });

  test("pages keep the viewer's row; no club = the world", () => {
    const page = fanbasePage(clubs, { scope: "world", myClubId: "me", offset: 0, limit: 2 });
    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(5);
    expect(page.mine?.rank).toBe(5);
    const none = fanbasePage(clubs, { scope: "league", myClubId: null, offset: 0, limit: 10 });
    expect(none.total).toBe(5);
    expect(none.mine).toBeNull();
  });
});
