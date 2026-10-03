import { describe, expect, test } from "bun:test";
import { applyTeamAttackConfig, getTeamCarryConfig, getTeamPassConfig } from "@/GameEngine/Configs/AttackConfig";
import { applyTeamTacticsConfig, getDefenseConfig } from "@/GameEngine/Configs/DefenseConfig";
import { HIGH_PRESS_STAMINA_MULT } from "@/GameEngine/Configs/FamiliarityConfig";
import type { TacticalStyle } from "@/types/tacticsTypes";
import type { FamiliarityLevels } from "@/types/familiarityTypes";

function snapshot(style: TacticalStyle, fam?: FamiliarityLevels) {
  applyTeamAttackConfig("A", style, "balanced", undefined, fam);
  applyTeamTacticsConfig("A", style, "balanced", undefined, fam);
  return { pass: { ...getTeamPassConfig("A") }, carry: { ...getTeamCarryConfig("A") }, def: { ...getDefenseConfig("A") } };
}

const STYLES: TacticalStyle[] = ["possession", "high_press", "counter_attack", "direct_play", "balanced"];

describe("familiarity → tactic weights", () => {
  test("familiarity 50 (and absent) leaves every weight exactly as the style sets it", () => {
    for (const style of STYLES) {
      const none = snapshot(style);
      const neutral = snapshot(style, { [style]: 50, long_ball: 50, high_line_trap: 50 });
      expect(neutral).toEqual(none);
    }
  });

  test("possession 100: lane and receiver-space weights +3%", () => {
    const base = snapshot("possession");
    const hi = snapshot("possession", { possession: 100 });
    expect(hi.pass.LANE_WEIGHT).toBeCloseTo(base.pass.LANE_WEIGHT * 1.03);
    expect(hi.pass.RECEIVER_SPACE_WEIGHT).toBeCloseTo(base.pass.RECEIVER_SPACE_WEIGHT * 1.03);
    expect(hi.pass.PROGRESS_WEIGHT).toBe(base.pass.PROGRESS_WEIGHT);
  });

  test("only the team's own style familiarity counts", () => {
    expect(snapshot("possession", { high_press: 100, counter_attack: 0 })).toEqual(snapshot("possession"));
  });

  test("high press: PRESS_INTENSITY ±0.05; press stamina +10% regardless of familiarity", () => {
    const base = snapshot("high_press");
    expect(snapshot("high_press", { high_press: 100 }).def.PRESS_INTENSITY).toBeCloseTo(base.def.PRESS_INTENSITY + 0.05);
    expect(snapshot("high_press", { high_press: 0 }).def.PRESS_INTENSITY).toBeCloseTo(base.def.PRESS_INTENSITY - 0.05);
    expect(base.def.PRESS_STAMINA_MULT).toBe(HIGH_PRESS_STAMINA_MULT);
    expect(snapshot("balanced").def.PRESS_STAMINA_MULT).toBe(1);
  });

  test("counter/direct: progress weight of pass and carry +3%", () => {
    for (const style of ["counter_attack", "direct_play"] as const) {
      const base = snapshot(style);
      const hi = snapshot(style, { [style]: 100 });
      expect(hi.pass.PROGRESS_WEIGHT).toBeCloseTo(base.pass.PROGRESS_WEIGHT * 1.03);
      expect(hi.carry.PROGRESS_WEIGHT).toBeCloseTo(base.carry.PROGRESS_WEIGHT * 1.03);
    }
  });

  test("high_line_trap only moves the line when the line is high", () => {
    const highBase = snapshot("high_press");
    expect(snapshot("high_press", { high_line_trap: 100 }).def.DEFENSIVE_LINE_HEIGHT)
      .toBeCloseTo(highBase.def.DEFENSIVE_LINE_HEIGHT + 0.03);
    expect(snapshot("balanced", { high_line_trap: 100 }).def.DEFENSIVE_LINE_HEIGHT)
      .toBe(snapshot("balanced").def.DEFENSIVE_LINE_HEIGHT);
  });

  test("long_ball scales the long-ball weight", () => {
    const base = snapshot("balanced");
    expect(snapshot("balanced", { long_ball: 100 }).pass.LONG_BALL_WEIGHT).toBeCloseTo(base.pass.LONG_BALL_WEIGHT * 1.05);
  });

  test("re-applying does not compound (weights are rebuilt from the style each time)", () => {
    snapshot("possession", { possession: 100 });
    const twice = snapshot("possession", { possession: 100 });
    const base = snapshot("possession");
    expect(twice.pass.LANE_WEIGHT).toBeCloseTo(base.pass.LANE_WEIGHT * 1.03);
  });
});

describe("press stamina under a high press", () => {
  test("tacticDrainMult: press ×1.10 under high_press, 1 otherwise", async () => {
    const { tacticDrainMult } = await import("@/GameEngine/Domain/gameState");
    applyTeamTacticsConfig("A", "high_press");
    applyTeamTacticsConfig("B", "balanced");
    expect(tacticDrainMult("A", "press")).toBe(HIGH_PRESS_STAMINA_MULT);
    expect(tacticDrainMult("A", "move")).toBe(1);
    expect(tacticDrainMult("B", "press")).toBe(1);
  });
});
