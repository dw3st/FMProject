import { describe, expect, test } from "bun:test";
import { planLineup, type LeagueRef } from "@/../scripts/espn/lineup";

describe("planLineup", () => {
  test("England: moves between covered leagues; a club with no lower league leaves the world", () => {
    const leagues: LeagueRef[] = [
      { slug: "premier_league", country: "England", tier: 1, members: ["33", "39", "47"] },
      { slug: "of_championship", country: "England", tier: 2, members: ["cov", "hull", "bir"] },
    ];
    const applied = new Map([
      ["premier_league", ["33", "47", "cov"]],
      ["of_championship", ["39", "hull", "es_1"]],
    ]);
    const r = planLineup(leagues, applied);
    expect(r.members.get("premier_league")).toEqual(["33", "47", "cov"]);
    expect(r.members.get("of_championship")).toEqual(["39", "es_1", "hull"]);
    expect(r.moves).toEqual([
      { squadId: "39", from: "premier_league", to: "of_championship" },
      { squadId: "cov", from: "of_championship", to: "premier_league" },
    ]);
    expect(r.removed).toEqual(["bir"]);
  });

  test("Brazil: displaced club drops to the highest uncovered level", () => {
    const leagues: LeagueRef[] = [
      { slug: "a", country: "Brazil", tier: 1, members: ["a1", "a2"] },
      { slug: "b", country: "Brazil", tier: 2, members: ["b1", "b2"] },
      { slug: "c", country: "Brazil", tier: 3, members: ["c1", "c2"] },
    ];
    const applied = new Map([["a", ["a1", "b1"]], ["b", ["a2", "c1"]]]);
    const r = planLineup(leagues, applied);
    expect(r.members.get("c")).toEqual(["b2", "c2"]);
    expect(r.removed).toEqual([]);
    expect(r.moves.map((m) => `${m.squadId}:${m.from}>${m.to}`)).toEqual(["a2:a>b", "b1:b>a", "b2:b>c", "c1:c>b"]);
  });

  test("among several groups on the lower level, the smallest one takes the club", () => {
    const leagues: LeagueRef[] = [
      { slug: "top", country: "X", tier: 1, members: ["t1", "t2"] },
      { slug: "g1", country: "X", tier: 2, members: ["x", "y", "z"] },
      { slug: "g2", country: "X", tier: 2, members: ["w"] },
    ];
    const r = planLineup(leagues, new Map([["top", ["t1"]]]));
    expect(r.members.get("g2")).toEqual(["t2", "w"]);
  });

  test("a club listed by two covered leagues throws", () => {
    const leagues: LeagueRef[] = [
      { slug: "a", country: "X", tier: 1, members: [] },
      { slug: "b", country: "X", tier: 2, members: [] },
    ];
    expect(() => planLineup(leagues, new Map([["a", ["k"]], ["b", ["k"]]]))).toThrow(/two leagues/);
  });
});
