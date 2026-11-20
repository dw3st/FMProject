import { describe, expect, test } from "bun:test";
import { conditionDrainMult, halfTimeCondition, outfieldMedianCondition } from "@/GameEngine/Domain/Condition";
import { evaluateAiSubstitutions } from "@/GameEngine/Domain/AiSubstitution";
import { CONDITION } from "@/GameEngine/Configs/ConditionConfig";
import { setDecisionFlags } from "@/GameEngine/Configs/DecisionConfig";
import { matchStartCondition, matchStartEnergy } from "@/Domain/fitness/fitness";
import { FITNESS } from "@/Domain/fitness/fitnessConfig";
import type { GamePlayer, GameState } from "@/GameEngine/types";

describe("FM condition curve (stage 14)", () => {
  test("drain fades toward the floor; keepers barely tire", () => {
    setDecisionFlags({});
    const full = conditionDrainMult({ energy: 100, role: "CM" });
    expect(full).toBeCloseTo(CONDITION.DRAIN_SCALE, 10);
    expect(conditionDrainMult({ energy: (100 + CONDITION.FLOOR) / 2, role: "CM" })).toBeCloseTo(full / 2, 10);
    expect(conditionDrainMult({ energy: CONDITION.FLOOR - 5, role: "CM" })).toBe(0);
    expect(conditionDrainMult({ energy: 100, role: "GK" })).toBeCloseTo(full * CONDITION.GK_DRAIN_SCALE, 10);
  });

  test("flag off: the drain and half-time recovery of before", () => {
    setDecisionFlags({ FM_CONDITION: false });
    expect(conditionDrainMult({ energy: 90, role: "CM" })).toBe(1);
    expect(halfTimeCondition({ energy: 60, startEnergy: 80, stamina: 10 }, 1)).toBeCloseTo(60 + 20 * 0.6, 10);
    setDecisionFlags({});
  });

  test("half time gives back ~2 points, never above the kick-off value", () => {
    setDecisionFlags({});
    expect(halfTimeCondition({ energy: 78, startEnergy: 99, stamina: 5 }, 1)).toBeCloseTo(80, 10);
    expect(halfTimeCondition({ energy: 98.5, startEnergy: 99, stamina: 10 }, 1)).toBe(99);
    expect(halfTimeCondition({ energy: 70, startEnergy: 99, stamina: 5 }, 0)).toBe(70);
  });

  test("kick-off condition: the reference matchday at 99, the compression of matchStartEnergy", () => {
    expect(matchStartCondition(FITNESS.FITNESS_REF)).toBe(FITNESS.FITNESS_REF + FITNESS.CONDITION_OFFSET);
    expect(matchStartCondition(100)).toBe(100);
    expect(matchStartCondition(70) - matchStartCondition(80)).toBeCloseTo(matchStartEnergy(70) - matchStartEnergy(80), 10);
  });

  test("outfield median skips the keeper", () => {
    expect(outfieldMedianCondition([{ energy: 99, role: "GK" }, { energy: 70, role: "CB" }, { energy: 80, role: "ST" }])).toBe(75);
  });
});

function pl(id: number, role: string, energy: number, team: "A" | "B" = "B"): GamePlayer {
  return {
    id, role, energy, team,
    baseStats: { withBall: { speed: 0.5, passingSkill: 0.5 }, withoutBall: { tackleChance: 0.5 } },
  } as unknown as GamePlayer;
}

function state(players: GamePlayer[], subsRemainingB = 5, pendingSubsB: GameState["pendingSubsB"] = []): GameState {
  return {
    matchPhase: "secondHalf",
    players,
    benchB: [pl(100, "CM", 99), pl(101, "ST", 99), pl(102, "CB", 99), pl(103, "LB", 99), pl(104, "LW", 99)],
    benchA: [],
    subsRemainingA: 5,
    subsRemainingB,
    pendingSubsA: [],
    pendingSubsB,
  } as unknown as GameState;
}

describe("FM AI substitutions (stage 14)", () => {
  setDecisionFlags({});
  const xi = [pl(1, "GK", 97), pl(2, "CB", 70), pl(3, "CM", 64), pl(4, "ST", 80), pl(5, "LW", 72)];

  test("nothing before 55'", () => {
    expect(evaluateAiSubstitutions(state(xi), "B", 54)).toEqual([]);
  });

  test("from 55' the players below 75 %, most tired first, at most 2 a check, with the reason", () => {
    const subs = evaluateAiSubstitutions(state(xi), "B", 56);
    expect(subs.map(s => s.outId)).toEqual([3, 2]);
    expect(subs.every(s => s.reason === "fatigue" && (s.why ?? "").includes("< 75"))).toBe(true);
  });

  test("planned changes stop at 4; queued ones count", () => {
    expect(evaluateAiSubstitutions(state(xi, 1), "B", 60)).toEqual([]);
    const queued = [{ outId: 3, inId: 100 }];
    const subs = evaluateAiSubstitutions(state(xi, 3, queued), "B", 60);
    expect(subs.map(s => s.outId)).toEqual([2]);
  });

  test("from 70' a side with fewer than 3 changes freshens its most tired player (tactical)", () => {
    const fresh = [pl(1, "GK", 97), pl(2, "CB", 82), pl(3, "CM", 79), pl(4, "ST", 85)];
    expect(evaluateAiSubstitutions(state(fresh), "B", 65)).toEqual([]);
    const subs = evaluateAiSubstitutions(state(fresh), "B", 71);
    expect(subs).toHaveLength(1);
    expect(subs[0]!.outId).toBe(3);
    expect(subs[0]!.reason).toBe("tactical");
  });
});
