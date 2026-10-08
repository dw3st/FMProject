import { describe, expect, test } from "bun:test";
import { applyDevelopment, applyTrainingDevelopment, DEFAULT_DP_WEIGHTS, type AreaMults, type RoleDPWeights } from "@/GameEngine/PlayerDevelopment";
import rolesData from "@/Data/roles.json";
import type { RosterPlayer } from "@/types/playerTypes";

const GK_W = (rolesData as unknown as Record<string, { dpWeights: RoleDPWeights }>).GK!.dpWeights;
const base = (age: number, positions = ["CM"]) => ({ id: "p", name: "p", age, positions,
  stats: { passing: 5, vision: 5, finishing: 5, dribbling: 5, speed: 5, acceleration: 5, tackling: 5, pressing: 5,
    stamina: 5, heading: 5, strength: 5, reflex: 5, jump: 5 } }) as unknown as RosterPlayer;
const run = (p: RosterPlayer, w: RoleDPWeights, mults?: AreaMults) => {
  for (let i = 0; i < 38; i++) {
    p = applyDevelopment(p, 7.2, w, 1, 1, mults).updatedPlayer;
    p = applyTrainingDevelopment(p, "normal", w, 1, mults).updatedPlayer;
  }
  return p;
};
const sum = (p: RosterPlayer) => Object.values(p.stats).reduce((a, b) => a + b, 0);
const all = (v: number): AreaMults => Object.fromEntries(Object.keys(DEFAULT_DP_WEIGHTS).map((k) => [k, v]));

describe("training areas", () => {
  test("goalkeeper reflex and jump now develop", () => {
    const p = run(base(19, ["GK"]), GK_W);
    expect(p.stats.reflex).toBeGreaterThan(5);
    expect(p.stats.jump).toBeGreaterThan(5);
  });
  test("strength and stamina develop through Físico", () => {
    const p = run(base(19), DEFAULT_DP_WEIGHTS);
    expect(p.stats.strength).toBeGreaterThan(5);
    expect(p.stats.stamina).toBeGreaterThan(5);
  });
  test("all multipliers at 1 = no multipliers", () => {
    expect(run(base(20), DEFAULT_DP_WEIGHTS, all(1)).stats).toEqual(run(base(20), DEFAULT_DP_WEIGHTS).stats);
  });
  test("a vacant area (0.4) grows less, a 1.25 area more", () => {
    const g0 = sum(run(base(19), DEFAULT_DP_WEIGHTS)) - sum(base(19));
    const gv = sum(run(base(19), DEFAULT_DP_WEIGHTS, all(0.4))) - sum(base(19));
    const gt = sum(run(base(19), DEFAULT_DP_WEIGHTS, all(1.25))) - sum(base(19));
    expect(gv / g0).toBeGreaterThan(0.3);
    expect(gv / g0).toBeLessThan(0.5);
    expect(gt / g0).toBeGreaterThan(1.1); // ~1.25 before the 0.1-step rounding of a short run
  });
  test("the area multiplier never touches the age decay", () => {
    const a = run(base(34), DEFAULT_DP_WEIGHTS, all(0.4));
    const b = run(base(34), DEFAULT_DP_WEIGHTS);
    expect(sum(a)).toBeCloseTo(sum(b), 6); // 34: no growth, only decay
  });
});
