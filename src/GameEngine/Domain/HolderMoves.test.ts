import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { TEST_SCENARIOS } from "@/GameEngine/Support/TestCases";
import { decide } from "@/GameEngine/Domain/DecisionTree";
import { HOLDER_MOVES, setDecisionFlags } from "@/GameEngine/Configs/DecisionConfig";
import { mulberry32 } from "@/Domain/rng";
import { facingAngleDeg } from "@/GameEngine/Domain/HolderMoves";

/** The holder moves (`HolderMoves.ts`): each /test scenario makes its move, and the flag off removes it. */
function firstMove(id: string, flags?: Record<string, boolean>): string | undefined {
  setDecisionFlags(flags);
  const real = Math.random;
  Math.random = mulberry32(7);
  try {
    const s = TEST_SCENARIOS.find(t => t.id === id)!.createState();
    const holder = s.players.find(p => p.id === s.ballHolderId)!;
    for (let i = 0; i < 6; i++) {
      const d = decide(holder, holder, true, false, s.players, null, 1, null, null, { A: "balanced", B: "balanced" }, null, 10);
      if ("move" in d && d.move) return d.move;
    }
    return undefined;
  } finally {
    Math.random = real;
    setDecisionFlags();
  }
}

describe("holder moves", () => {
  // The scenarios are close calls at the calibrated weights: the test doubles them so each move clearly wins.
  const saved = { ...HOLDER_MOVES };
  beforeAll(() => { for (const k of ["SHIELD_WEIGHT", "CUT_WEIGHT", "LAYOFF_WEIGHT", "CHIP_WEIGHT", "ROUND_WEIGHT"] as const) HOLDER_MOVES[k] *= 2; });
  afterAll(() => { Object.assign(HOLDER_MOVES, saved); });

  test("facing angle", () => {
    expect(facingAngleDeg({ x: 50, y: 37, attackDir: 1, vel: { x: 3, y: 0 } })).toBeCloseTo(0, 5);
    expect(facingAngleDeg({ x: 50, y: 37, attackDir: 1, vel: { x: -3, y: 0 } })).toBeCloseTo(180, 5);
    expect(facingAngleDeg({ x: 50, y: 37, attackDir: 1, vel: { x: 0.1, y: 0 } })).toBeNull();
  });

  for (const [id, move, flag] of [
    ["move-shield", "shield", "SHIELD"], ["move-cut-inside", "cut_inside", "CUT_INSIDE"], ["move-lay-off", "lay_off", "LAY_OFF"],
    ["move-chip", "chip", "CHIP"], ["move-round-keeper", "round_keeper", "ROUND_KEEPER"],
  ] as const) {
    test(`${id}: ${move}, gone with ${flag} off`, () => {
      expect(firstMove(id)).toBe(move);
      expect(firstMove(id, { [flag]: false })).not.toBe(move);
    });
  }
});
