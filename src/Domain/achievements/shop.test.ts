import { describe, expect, test } from "bun:test";
import { legendPool } from "@/Domain/achievements/shop";
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

describe("legend pool", () => {
  const ids = (list: RetiredPlayer[]) => legendPool(list).map((r) => r.id);
  test("every legend is listed, not just three (report), best first", () => {
    const pool = Array.from({ length: 30 }, (_, i) => retired(`r${String(i).padStart(2, "0")}`, { statsAtRetirement: stats(5 + i / 10) }));
    expect(ids(pool)).toHaveLength(30);
    expect(ids(pool)[0]).toBe("r29");
  });
  test("one already brought back, a reborn or a free agent is never offered", () => {
    const pool = [retired("a"), retired("b", { legendBy: "seat-1" }), retired("c", { rebornOffer: "accepted" }), retired("d", { freeAgent: true })];
    expect(ids(pool)).toEqual(["a"]);
  });
  test("a young world with few legends still shows the best retirees", () => {
    const pool = Array.from({ length: 20 }, (_, i) => retired(`r${i}`, { wasWorldClass: false, statsAtRetirement: stats(2) }));
    expect(ids(pool)).toHaveLength(12);
  });
});
