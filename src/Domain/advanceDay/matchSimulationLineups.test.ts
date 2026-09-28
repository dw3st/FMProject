import { describe, expect, test } from "bun:test";
import { resolveUserLineup } from "@/Domain/advanceDay/matchSimulationLineups";
import { autoFillLineupWithFitness } from "@/Domain/lineupHelpers";
import { getFormationSlots } from "@/types/formationSlots";
import { formationForSimId, DEFAULT_SIM_FORMATION_ID } from "@/Domain/matchFormations";
import type { RosterPlayer, Squad } from "@/types/playerTypes";
import { emptySeasonLog } from "@/types/playerTypes";

const ROLES = ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CAM", "LW", "ST", "RW"];

function squadOf11(): Squad {
  const players: RosterPlayer[] = ROLES.map((role, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    age: 25,
    squadId: "s",
    preferredFoot: "right",
    positions: [role],
    stats: {
      passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5,
      tackling: 5, pressing: 5, stamina: 7, heading: 5, strength: 5, reflex: 5, jump: 5,
    },
    profile: { summary: "", archetype: "" },
    seasonLog: emptySeasonLog(),
  }));
  return { id: "s", name: "s", colors: ["#000", "#fff"], money: 0, players };
}

describe("resolveUserLineup", () => {
  const formation = formationForSimId(DEFAULT_SIM_FORMATION_ID);
  const slots = getFormationSlots(formation as unknown as Parameters<typeof getFormationSlots>[0], "attacking");

  test("empty saved lineup falls back to the same fitness-aware auto-fill the AI uses", () => {
    const squad = squadOf11();
    const result = resolveUserLineup(squad, formation, []);
    expect(result).toEqual(autoFillLineupWithFitness(slots, squad.players));
    expect(result).toHaveLength(11);
    expect(result.every((id) => id !== "")).toBe(true);
  });

  test("a full saved lineup is used as-is (aligned by slot)", () => {
    const squad = squadOf11();
    const saved = squad.players.map((p) => p.id);
    const result = resolveUserLineup(squad, formation, saved);
    expect(result).toEqual(saved);
  });

  test("a corrupted (non-empty, wrong-length) saved lineup still resolves to 11 ids", () => {
    const squad = squadOf11();
    const result = resolveUserLineup(squad, formation, ["p0", "p1"]);
    expect(result).toHaveLength(11);
    expect(new Set(result).size).toBe(11);
  });
});
