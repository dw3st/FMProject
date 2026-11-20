import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { LEGACY_CLOCK_SCALE } from "@/GameEngine/Domain/gameState";
import { simulateMatch, type TeamTactics } from "@/GameEngine/Domain/SimulateMatch";
import type { Squad } from "@/types/playerTypes";

function loadSquad(file: string): Squad {
  const path = fileURLToPath(new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Squad;
}

const fingerprint = (r: ReturnType<typeof simulateMatch>) => JSON.stringify({
  score: r.score,
  a: [r.teamStats.A.shots, r.teamStats.A.passesAttempted, r.teamStats.A.tackles, r.teamStats.A.fouls],
  b: [r.teamStats.B.shots, r.teamStats.B.passesAttempted, r.teamStats.B.tackles, r.teamStats.B.fouls],
});

function play(tA: TeamTactics, tB: TeamTactics, decisions?: Record<string, boolean>): string {
  return fingerprint(simulateMatch(loadSquad("33.json"), loadSquad("34.json"), undefined, undefined, undefined, undefined, {
    seed: 4242, clockScale: LEGACY_CLOCK_SCALE, tactics: { A: tA, B: tB }, ...(decisions ? { decisions } : {}),
  }));
}

describe("team instructions (stage 20): the template plays as the style always did", () => {
  test("the style's template written out = nothing written; flag off = on with nothing", () => {
    const plain = play({ style: "counter_attack" }, { style: "balanced" });
    const written = play({
      style: "counter_attack",
      instructions: {
        inPossession: { passing: 1, width: -1, tempo: 1, passTarget: 1 },
        transition: { onWin: 2, onLoss: -1 },
        outOfPossession: { line: -1, engagement: -1, pressing: -1, tackling: -1, defWidth: -1 },
      },
    }, { style: "balanced", instructions: {}, mentality: 0 });
    expect(written).toBe(plain);
    expect(play({ style: "counter_attack" }, { style: "balanced" }, { TEAM_INSTRUCTIONS: false })).toBe(plain);
  }, 120_000);
});

describe("4c-2: pressing split into engagement, intensity and tackling", () => {
  test("each moves its own value; the style fills the three", async () => {
    const { applyTeamTacticsConfig, getDefenseConfig, getDefenseTacticKeys } = await import("@/GameEngine/Configs/DefenseConfig");
    const { applyTeamAttackConfig } = await import("@/GameEngine/Configs/AttackConfig");
    const { setDecisionFlags } = await import("@/GameEngine/Configs/DecisionConfig");
    setDecisionFlags();
    const apply = (instr?: Parameters<typeof applyTeamAttackConfig>[5], m?: number) => {
      applyTeamTacticsConfig("A", "balanced", "balanced", undefined, undefined, instr, m);
      applyTeamAttackConfig("A", "balanced", "balanced", undefined, undefined, instr, m);
    };
    apply();
    const base = { ...getDefenseConfig("A") };
    apply({ outOfPossession: { engagement: 1 } });
    expect(getDefenseTacticKeys("A").engagementStyle).toBe("high_press");
    expect(getDefenseTacticKeys("A").pressingStyle).toBe("mid_block");
    expect(getDefenseConfig("A").TACKLE_AGGRESSION).toBe(base.TACKLE_AGGRESSION);
    apply({ outOfPossession: { tackling: 2 } });
    expect(getDefenseConfig("A").TACKLE_AGGRESSION).toBeCloseTo(0.65 + 0.1);
    apply({ outOfPossession: { line: -2 } });
    expect(getDefenseConfig("A").DEFENSIVE_LINE_HEIGHT).toBeCloseTo(0.40 - 0.05);
    apply(undefined, 2);
    expect(getDefenseConfig("A").DEFENSIVE_LINE_HEIGHT).toBeCloseTo(base.DEFENSIVE_LINE_HEIGHT + 0.05);
    applyTeamTacticsConfig("A", "counter_attack");
    applyTeamAttackConfig("A", "counter_attack");
    expect(getDefenseTacticKeys("A").engagementStyle).toBe("low_block");
    expect(getDefenseConfig("A").TACKLE_AGGRESSION).toBe(0.25);
    apply();
  });
});

describe("4c-3: the transition clock", () => {
  test("windows and the regain time", async () => {
    const { setPossessionClock, transitionOf, resetInstructionState } = await import("@/GameEngine/Configs/InstructionConfig");
    resetInstructionState();
    expect(setPossessionClock("A", 0, 10)).toBeNull();
    expect(transitionOf("A")).toBe("won");
    expect(setPossessionClock("B", 0, 20)).toEqual({ won: "B", sinceLost: Infinity });
    expect(transitionOf("A")).toBe("lost");
    setPossessionClock(null, 0, 21);
    expect(transitionOf("A")).toBeNull();
    expect(setPossessionClock("A", 0, 23)).toEqual({ won: "A", sinceLost: 3 });
    setPossessionClock("A", 7, 30);
    expect(transitionOf("A")).toBeNull();
    resetInstructionState();
  });

  test("a counter-press instruction changes a seeded match; the regains are counted", () => {
    const plain = simulateMatch(loadSquad("33.json"), loadSquad("34.json"), undefined, undefined, undefined, undefined, {
      seed: 4242, clockScale: LEGACY_CLOCK_SCALE, tactics: { A: { style: "balanced" }, B: { style: "balanced" } },
    });
    const press = simulateMatch(loadSquad("33.json"), loadSquad("34.json"), undefined, undefined, undefined, undefined, {
      seed: 4242, clockScale: LEGACY_CLOCK_SCALE,
      tactics: { A: { style: "balanced", instructions: { transition: { onLoss: 2, onWin: 2 } } }, B: { style: "balanced" } },
    });
    expect(fingerprint(press)).not.toBe(fingerprint(plain));
    expect(plain.teamStats.A.counterPressRegains + plain.teamStats.B.counterPressRegains).toBeGreaterThan(0);
  }, 120_000);
});

describe("4c-4: the holder's instructions", () => {
  test("shoot more often, dribble less, tempo, keeper distribution move the category multiplier", async () => {
    const { applyTeamAttackConfig } = await import("@/GameEngine/Configs/AttackConfig");
    const { holderInstructionMult } = await import("@/GameEngine/Configs/InstructionConfig");
    const p = { team: "A", role: "ST", attackDir: 1, instruction: undefined } as never;
    const gk = { team: "A", role: "GK", attackDir: 1 } as never;
    const c = (cat: number, kind: string) => ({ cat, kind, targetY: null, toEnd: 30, backward: false });
    applyTeamAttackConfig("A", "balanced");
    expect(holderInstructionMult(p, c(1, "shot"))).toBe(1);
    applyTeamAttackConfig("A", "balanced", "balanced", undefined, undefined, {
      inPossession: { shooting: 2, dribbling: -2, tempo: 2, gkDistribution: 2 },
    });
    expect(holderInstructionMult(p, c(1, "shot"))).toBeCloseTo(1.25);
    expect(holderInstructionMult(p, c(4, "dribble"))).toBeCloseTo(0.85);
    expect(holderInstructionMult(p, c(3, "hold"))).toBeCloseTo(0.9);
    expect(holderInstructionMult(gk, c(0, "long_ball"))).toBeCloseTo(1.4);
    applyTeamAttackConfig("A", "balanced");
  });
});

describe("4c-5: anchors (overlap, underlap, pressing trap)", () => {
  test("full-back anchors move with the flank instruction, the block with the pressing trap", async () => {
    const { applyTeamAttackConfig } = await import("@/GameEngine/Configs/AttackConfig");
    const { slotBasePosition } = await import("@/GameEngine/FormationSlots");
    const { formationForSimId } = await import("@/Domain/matchFormations");
    const f = formationForSimId("4-3-3");
    const lbSlot = f.attacking.findIndex((s) => s.role === "LB");
    const lb = { slotIndex: lbSlot, attackDir: 1 as const, team: "A" as const, role: "LB" };
    applyTeamAttackConfig("A", "balanced");
    const base = slotBasePosition(lb, f, "attacking");
    const baseDef = slotBasePosition(lb, f, "defending");
    applyTeamAttackConfig("A", "balanced", "balanced", undefined, undefined, { inPossession: { flanks: 2 }, outOfPossession: { trap: 2 } });
    expect(slotBasePosition(lb, f, "attacking").x).toBeCloseTo(base.x + 6);
    const def = slotBasePosition(lb, f, "defending");
    expect(Math.abs(def.y - 37)).toBeCloseTo(Math.abs(baseDef.y - 37) - 3);
    applyTeamAttackConfig("A", "balanced", "balanced", undefined, undefined, { inPossession: { flanks: -2 } });
    const under = slotBasePosition(lb, f, "attacking");
    expect(under.x).toBeCloseTo(base.x);
    expect(Math.abs(under.y - 37)).toBeLessThan(Math.abs(base.y - 37));
    applyTeamAttackConfig("A", "balanced");
  });
});

describe("4c-7: the AI's instructions and the group familiarity", () => {
  test("an AI side re-picks its levels when leading late; a human side never", async () => {
    const { applyTeamAttackConfig } = await import("@/GameEngine/Configs/AttackConfig");
    const { setTeamAi, stepAiInstructions, instrDelta, instrMentality } = await import("@/GameEngine/Configs/InstructionConfig");
    applyTeamAttackConfig("A", "balanced");
    setTeamAi("A", false);
    expect(stepAiInstructions("A", 1, 80)).toBe(false);
    setTeamAi("A", true);
    expect(stepAiInstructions("A", 0, 30)).toBe(false);
    expect(stepAiInstructions("A", 1, 80)).toBe(true);
    expect(instrDelta("A", "onLoss")).toBeLessThan(0);
    expect(instrMentality("A")).toBe(-1);
    expect(stepAiInstructions("A", 1, 81)).toBe(false);
    setTeamAi("A", false);
    applyTeamAttackConfig("A", "balanced");
  });

  test("familiarity scales an instruction's step from the template", async () => {
    const { applyTeamAttackConfig } = await import("@/GameEngine/Configs/AttackConfig");
    const { instrDelta } = await import("@/GameEngine/Configs/InstructionConfig");
    applyTeamAttackConfig("A", "balanced", "balanced", undefined, { instr_transition: 0 }, { transition: { onLoss: 2 } });
    expect(instrDelta("A", "onLoss")).toBeCloseTo(1);
    applyTeamAttackConfig("A", "balanced", "balanced", undefined, { instr_transition: 100 }, { transition: { onLoss: 2 } });
    expect(instrDelta("A", "onLoss")).toBeCloseTo(2);
    applyTeamAttackConfig("A", "balanced");
  });
});
