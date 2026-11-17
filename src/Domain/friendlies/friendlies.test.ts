import { describe, expect, test } from "bun:test";
import { friendlyDue, friendlyPool, friendlySubs, isFriendlyDay, pickOpponent } from "@/Domain/friendlies/friendlies";
import type { RosterPlayer } from "@/types/playerTypes";

const SAT = "2026-08-01";
const SAT_NEXT = "2026-08-08";
const player = (id: string, role = "Midfielder", fitness = 90): RosterPlayer =>
  ({ id, positions: [role], seasonLog: { fitness } }) as unknown as RosterPlayer;

describe("friendlyDue", () => {
  const base = { date: SAT, nextOfficial: "2026-08-15", blocked: false, playsToday: false };
  test("a Saturday in the pre-season", () => {
    expect(isFriendlyDay(SAT)).toBe(true);
    expect(friendlyDue(base)).toBe(true);
  });
  test("not on another day", () => expect(friendlyDue({ ...base, date: "2026-08-02" })).toBe(false));
  test("not too close to the next official game", () => expect(friendlyDue({ ...base, nextOfficial: "2026-08-06" })).toBe(false));
  test("from eight weeks before it, not earlier", () => {
    expect(friendlyDue({ ...base, nextOfficial: "2026-09-26" })).toBe(true);
    expect(friendlyDue({ ...base, nextOfficial: "2026-09-27" })).toBe(false);
  });
  test("not on a FIFA date, a match day, or with no game ahead", () => {
    expect(friendlyDue({ ...base, blocked: true })).toBe(false);
    expect(friendlyDue({ ...base, playsToday: true })).toBe(false);
    expect(friendlyDue({ ...base, nextOfficial: null })).toBe(false);
  });
});

describe("friendlyPool", () => {
  const squad = [player("gk1", "GK"), player("gk2", "GK"), ...Array.from({ length: 22 }, (_, i) => player(`p${i}`))];
  const xi = ["gk1", ...Array.from({ length: 10 }, (_, i) => `p${i}`)];
  test("starters and reserves take turns", () => {
    const pools = [SAT, SAT_NEXT].map((d) => friendlyPool(squad, d, xi)!);
    const withStarters = pools.find((p) => p.some((x) => x.id === "gk1"))!;
    const reserves = pools.find((p) => !p.some((x) => x.id === "gk1"))!;
    expect(withStarters).toHaveLength(24);
    expect(reserves).toHaveLength(13);
    expect(reserves.some((p) => xi.includes(p.id))).toBe(false);
  });
  test("a starter still settling in plays on the reserves' week too (report 4bf4efac)", () => {
    const settling = squad.map((p) => (p.id === "p1" || p.id === "p2" ? { ...p, settling: { games: 0, need: 10 } } : p));
    const reserves = [SAT, SAT_NEXT].map((d) => friendlyPool(settling, d, xi)!).find((p) => !p.some((x) => x.id === "gk1"))!;
    expect(reserves).toHaveLength(15);
    expect(reserves.some((p) => p.id === "p1")).toBe(true);
    expect(reserves.some((p) => p.id === "p2")).toBe(true);
    expect(reserves.some((p) => p.id === "p3")).toBe(false);
  });
  test("a tired player stays out", () => {
    const pools = [SAT, SAT_NEXT].map((d) => friendlyPool([...squad, player("tired", "Forward", 40)], d, xi)!);
    expect(pools.flat().some((p) => p.id === "tired")).toBe(false);
  });
  test("without reserves to field a team, the whole squad", () => {
    const small = [player("gk1", "GK"), ...Array.from({ length: 12 }, (_, i) => player(`p${i}`))];
    for (const d of [SAT, SAT_NEXT]) expect(friendlyPool(small, d, xi)).toHaveLength(13);
  });
  test("no goalkeeper or too few players: no team", () => {
    expect(friendlyPool(Array.from({ length: 15 }, (_, i) => player(`p${i}`)), SAT, [])).toBeNull();
    expect(friendlyPool([player("gk", "GK"), player("a")], SAT, [])).toBeNull();
  });
});

describe("pickOpponent", () => {
  test("never himself nor a human club", () => {
    expect(pickOpponent(["a", "b", "c"], "a", new Set(["b"]), 0.5)).toBe("c");
    expect(pickOpponent(["a"], "a", new Set(), 0)).toBeNull();
  });
});

describe("friendlySubs", () => {
  test("players still settling in come on first, fewest games first", () => {
    const bench = ["a", "b", "c", "d", "e", "f", "g"].map((id) => player(id));
    bench[5] = { ...bench[5]!, settling: { games: 4, need: 10 } };
    bench[6] = { ...bench[6]!, settling: { games: 0, need: 10 } };
    const subs = friendlySubs(bench, 3, () => 0.5);
    expect(subs.slice(0, 2).map((p) => p.id)).toEqual(["g", "f"]);
    expect(subs).toHaveLength(3);
  });
  test("without newcomers the draw decides", () => {
    const bench = ["a", "b", "c"].map((id) => player(id));
    let k = 0;
    const draws = [0.9, 0.1, 0.5];
    expect(friendlySubs(bench, 2, () => draws[k++]!).map((p) => p.id)).toEqual(["b", "c"]);
  });
});
