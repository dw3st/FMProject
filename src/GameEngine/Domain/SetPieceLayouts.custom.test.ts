import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { createMatchState } from "@/GameEngine/Domain/gameState";
import { resolveFormationSetPieces, getFormationSetPieces } from "@/GameEngine/Domain/SetPieceLayouts";
import { applySetPieceToTeam } from "@/GameEngine/Domain/SetPiecePositioning";
import { formationForSimId } from "@/Domain/matchFormations";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

const KINDS = [
  "kickOff", "kickOffDefend", "goalKick", "corner_Attack", "corner_Defend",
  "throwIn_Attack", "throwIn_Defend", "freeKick_Attack", "freeKick_Defend", "offside_fk",
] as const;

describe("custom formation set pieces", () => {
  const custom = { ...formationForSimId("4-3-3"), id: "custom" };

  test("no hand-made layouts exist for the custom id, a generated set is used", () => {
    expect(getFormationSetPieces("custom")).toBeNull();
    const sp = resolveFormationSetPieces(custom);
    for (const k of KINDS) expect(sp[k].slots).toHaveLength(11);
  });

  for (const kind of KINDS) {
    test(`team is repositioned for ${kind}`, () => {
      const state = createMatchState(loadSquad("33.json").players, custom, loadSquad("34.json").players, custom);
      const layout = resolveFormationSetPieces(custom)[kind];
      const out = applySetPieceToTeam(state.players, "A", layout);
      const want = layout.slots.map((s) => `${s.x},${s.y}`).sort();
      const got = out.filter((p) => p.team === "A").map((p) => `${p.x},${p.y}`).sort();
      expect(got).toEqual(want);
    });
  }
});
