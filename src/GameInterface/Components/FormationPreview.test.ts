import { describe, expect, test } from "bun:test";
import { formationPreview } from "@/GameInterface/Components/FormationPreview";
import type { GamePlayer } from "@/GameEngine/types";
import type { Formation } from "@/GameEngine/types";

const current = {
  id: "x", attacking: [{ role: "GK", x: 5, y: 37 }, { role: "LB", x: 20, y: 10 }, { role: "ST", x: 90, y: 37 }],
} as unknown as Formation;
const next = {
  id: "y", attacking: [{ role: "GK", x: 5, y: 37 }, { role: "ST", x: 90, y: 37 }, { role: "CB", x: 20, y: 30 }],
} as unknown as Formation;

function player(id: number, slotIndex: number, role: string, aptitudes: Record<string, string>): GamePlayer {
  return { id, slotIndex, role, name: `P${id}`, rosterId: `r${id}`, fit: { stats: {}, aptitudes } } as unknown as GamePlayer;
}
const xi = [
  player(1, 0, "GK", { GK: "natural" }),
  player(2, 1, "LB", { LB: "natural", CB: "apt", ST: "unsuitable" }),
  player(3, 2, "ST", { ST: "natural", CB: "unsuitable" }),
];

describe("formationPreview", () => {
  test("shows the team reorganised, each player in the slot that suits him", () => {
    const { rows } = formationPreview(xi, next, current);
    expect(rows.map((r) => [r.player.id, r.slot, r.role])).toEqual([[1, 0, "GK"], [2, 2, "CB"], [3, 1, "ST"]]);
  });
  test("counts who leaves his natural position", () => {
    const { outOfPosition, rows } = formationPreview(xi, next, current);
    expect(outOfPosition).toBe(1);
    expect(rows[1]!.outOfPosition).toBe(true);
  });
  test("the current formation shows everyone where he is", () => {
    const { rows, outOfPosition } = formationPreview(xi, current, current);
    expect(rows.map((r) => r.slot)).toEqual([0, 1, 2]);
    expect(outOfPosition).toBe(0);
  });
});
