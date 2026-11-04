import { describe, expect, test } from "bun:test";
import { formationPreview } from "@/GameInterface/Components/FormationPreview";
import type { GamePlayer } from "@/GameEngine/types";
import type { Formation } from "@/GameEngine/types";

const formation = {
  attacking: [{ role: "GK" }, { role: "CB" }, { role: "ST" }],
} as unknown as Formation;

function player(id: number, slotIndex: number, role: string, natural: string): GamePlayer {
  return {
    id, slotIndex, role, name: `P${id}`, rosterId: `r${id}`,
    fit: { stats: {}, aptitudes: { [natural]: "natural" } },
  } as unknown as GamePlayer;
}

describe("formationPreview", () => {
  test("each player takes the role of his slot in the new formation", () => {
    const { rows } = formationPreview([player(1, 0, "GK", "GK"), player(2, 1, "LB", "LB")], formation);
    expect(rows.map((r) => r.role)).toEqual(["GK", "CB"]);
  });

  test("counts who leaves his natural position", () => {
    const { outOfPosition, rows } = formationPreview([player(1, 0, "GK", "GK"), player(2, 1, "LB", "LB"), player(3, 2, "ST", "ST")], formation);
    expect(outOfPosition).toBe(1);
    expect(rows[1]!.outOfPosition).toBe(true);
  });

  test("a slot the formation does not have leaves the player out", () => {
    expect(formationPreview([player(4, 9, "CM", "CM")], formation).rows).toEqual([]);
  });
});
