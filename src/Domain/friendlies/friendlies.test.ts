import { describe, expect, test } from "bun:test";
import { friendlyDue, friendlyPool, isFriendlyDay, pickOpponent } from "@/Domain/friendlies/friendlies";
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
  test("not too long before it", () => expect(friendlyDue({ ...base, nextOfficial: "2026-09-13" })).toBe(false));
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
