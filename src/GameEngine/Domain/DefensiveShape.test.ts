import { describe, expect, test } from "bun:test";
import { computeDefensiveShapeAnchor } from "@/GameEngine/Domain/DefensivePositioning";
import { getDefenseConfig } from "@/GameEngine/Configs/DefenseConfig";
import { formationForSimId } from "@/Domain/matchFormations";
import type { GamePlayer } from "@/GameEngine/types";

// 4-3-3, slot 10 = RW (defending slot 50, 66).
const f433 = formationForSimId("4-3-3");
const rw = { slotIndex: 10, attackDir: 1, role: "RW", team: "A" } as unknown as GamePlayer;

describe("defensive block shift (Etapa 19)", () => {
  test("the whole block slides toward the ball side: a far-side winger tucks in", () => {
    const cfg = getDefenseConfig("A");
    const ballFar = computeDefensiveShapeAnchor(rw, { x: 60, y: 8 }, f433, cfg);
    const ballNear = computeDefensiveShapeAnchor(rw, { x: 60, y: 66 }, f433, cfg);
    // Ball on the opposite flank: the RW comes in by at least a quarter of the 58-yard offset.
    expect(66 - ballFar.y).toBeGreaterThan(58 * 0.25);
    // Ball on his own flank: he stays wide (only the small centre compactness applies).
    expect(ballNear.y).toBeGreaterThan(60);
  });
});
