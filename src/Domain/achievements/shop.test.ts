import { describe, expect, test } from "bun:test";
import { legendOptions } from "@/Domain/achievements/shop";
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

describe("legend options", () => {
  test("a legend already brought back by a seat is never offered again", () => {
    const pool = [retired("a"), retired("b", { legendBy: "seat-1" }), retired("c"), retired("d")];
    const ids = legendOptions(pool, "save", "2027-07-01");
    expect(ids).not.toContain("b");
    expect(ids.length).toBe(3);
  });
  test("solo draws as before; a seat draws with its own seed", () => {
    const pool = Array.from({ length: 12 }, (_, i) => retired(`r${i}`));
    expect(legendOptions(pool, "save", "2027-07-01", undefined)).toEqual(legendOptions(pool, "save", "2027-07-01"));
    const bySeat = new Set(["s1", "s2", "s3", "s4", "s5"].map((s) => legendOptions(pool, "save", "2027-07-01", s).join(",")));
    expect(bySeat.size).toBeGreaterThan(1);
  });
});
