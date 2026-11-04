import { describe, expect, test } from "bun:test";
import { assignMinCost, reorganizedSlots, type ReorganizePlayer } from "@/Domain/formation/reorganize";
import { formationForSimId, FORMATION_IDS } from "@/Domain/matchFormations";

const slots = (id: string) => formationForSimId(id).attacking.map((s) => ({ role: s.role as string, x: s.x, y: s.y }));

/** Starters natural in their slot of `id`, unsuitable anywhere else. */
function team(id: string): ReorganizePlayer[] {
  return slots(id).map((s, i) => ({ id: i + 1, role: s.role, slotIndex: i, aptitudes: { [s.role]: "natural" as const } }));
}

describe("assignMinCost", () => {
  test("finds the cheapest pairing, not the greedy one", () => {
    expect(assignMinCost([[1, 2], [1, 100]])).toEqual([1, 0]);
  });
  test("takes fewer rows than columns", () => {
    expect(assignMinCost([[9, 1, 9]])).toEqual([1]);
  });
});

describe("reorganizedSlots", () => {
  test("every player gets his own slot and the keeper stays in goal, across all formations", () => {
    const players = team("4-3-3");
    for (const fid of FORMATION_IDS) {
      const next = slots(fid);
      const out = reorganizedSlots(players, slots("4-3-3"), next);
      expect(new Set(out.values()).size).toBe(11);
      expect(next[out.get(1)!]!.role).toBe("GK");
    }
  });
  test("a player natural in a slot of the new shape goes there, whatever his slot number was", () => {
    const cur = [{ role: "GK", x: 5, y: 37 }, { role: "CB", x: 20, y: 30 }, { role: "ST", x: 90, y: 37 }];
    const next = [{ role: "GK", x: 5, y: 37 }, { role: "ST", x: 90, y: 37 }, { role: "CB", x: 20, y: 30 }];
    const players: ReorganizePlayer[] = [
      { id: 1, role: "GK", slotIndex: 0, aptitudes: { GK: "natural" } },
      { id: 2, role: "CB", slotIndex: 1, aptitudes: { CB: "natural" } },
      { id: 3, role: "ST", slotIndex: 2, aptitudes: { ST: "natural" } },
    ];
    const out = reorganizedSlots(players, cur, next);
    expect(out.get(2)).toBe(2);
    expect(out.get(3)).toBe(1);
  });
  test("between equal fits he takes the closest slot (the left back stays on the left)", () => {
    const cur = [{ role: "LB", x: 20, y: 10 }, { role: "RB", x: 20, y: 64 }];
    const next = [{ role: "CB", x: 20, y: 60 }, { role: "CB", x: 20, y: 14 }];
    const players: ReorganizePlayer[] = [
      { id: 1, role: "LB", slotIndex: 0, aptitudes: { CB: "apt" } },
      { id: 2, role: "RB", slotIndex: 1, aptitudes: { CB: "apt" } },
    ];
    const out = reorganizedSlots(players, cur, next);
    expect(out.get(1)).toBe(1);
    expect(out.get(2)).toBe(0);
  });
  test("a blocked slot stays empty", () => {
    const players = team("4-3-3").filter((p) => p.id !== 11);
    const out = reorganizedSlots(players, slots("4-3-3"), slots("4-4-2"), [10]);
    expect([...out.values()]).not.toContain(10);
  });
  test("without aptitudes nobody moves", () => {
    const players: ReorganizePlayer[] = team("4-3-3").map((p) => ({ id: p.id, role: p.role, slotIndex: p.slotIndex }));
    const out = reorganizedSlots(players, slots("4-3-3"), slots("3-5-2"));
    for (const p of players) expect(out.get(p.id)).toBe(p.slotIndex);
  });
});
