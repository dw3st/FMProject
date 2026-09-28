import { describe, expect, test } from "bun:test";
import {
  applyContinuousFatigue,
  applyStaminaCost,
  consumeEnergy,
  getReductionFactor,
  getRuntimeLineup,
  normalizeGamePlayer,
  overallEnergyFactor,
  STAMINA_COST,
} from "@/GameEngine/Domain/RuntimeLineup";
import type { GamePlayer, PlayerStats } from "@/GameEngine/types";

const sampleBase: PlayerStats = {
  withBall: {
    shootAccuracy: 0.8,
    carrySpeed: 5,
    carryVision: 12,
    speed: 0.8,
    acceleration: 0.7,
    passingSkill: 0.5,
    vision: 0.6,
    firstTouch: 0.55,
    dribbling: 0.6,
    strength: 0.5,
  },
  withoutBall: {
    pressRange: 8,
    pressSpeed: 5,
    speed: 0.8,
    acceleration: 0.7,
    tackleChance: 0.5,
    tackling: 0.5,
    interceptionChance: 0.4,
    gkPositioning: 0,
    gkReflex: 0,
    gkDiving: 0,
    strength: 0.5,
  },
};

describe("getReductionFactor", () => {
  test("no energy lost yields full multiplier", () => {
    expect(getReductionFactor(0, 10)).toBe(1);
  });

  test("floors steps and applies 0.1 floor", () => {
    expect(getReductionFactor(9, 10)).toBe(1);
    expect(getReductionFactor(10, 10)).toBe(0.9);
    expect(getReductionFactor(100, 10)).toBe(0.1);
  });
});

describe("consumeEnergy", () => {
  test("higher stamina reduces move cost", () => {
    const dtGame = 0.3; // one live-game tick worth of game-time
    const from100 = (stamina: number) =>
      consumeEnergy(100, stamina, "move", dtGame);
    expect(from100(10)).toBeGreaterThan(from100(0));
    expect(from100(10)).toBeCloseTo(100 - STAMINA_COST.move * (1 - 0.5) * dtGame, 10);
  });

  test("defaults to no load penalty (multiplier 1) when omitted", () => {
    const dtGame = 0.3;
    expect(consumeEnergy(100, 5, "move", dtGame)).toBe(consumeEnergy(100, 5, "move", dtGame, 1));
  });

  test("higher load multiplier drains more energy", () => {
    const dtGame = 0.3;
    const noLoad = consumeEnergy(100, 5, "move", dtGame, 1);
    const highLoad = consumeEnergy(100, 5, "move", dtGame, 1.25);
    expect(highLoad).toBeLessThan(noLoad);
    expect(100 - highLoad).toBeCloseTo((100 - noLoad) * 1.25, 10);
  });
});

describe("getRuntimeLineup", () => {
  test("full energy preserves base scaled stats (multipliers 1)", () => {
    const rt = getRuntimeLineup(sampleBase, { energy: 100 });
    expect(rt.withBall.carrySpeed).toBe(sampleBase.withBall.carrySpeed);
    expect(rt.withBall.passingSkill).toBe(sampleBase.withBall.passingSkill);
    expect(rt.withoutBall.pressRange).toBe(sampleBase.withoutBall.pressRange);
  });

  test("low energy hits physical harder than technical", () => {
    const rt = getRuntimeLineup(sampleBase, { energy: 0 });
    const physRatio = rt.withBall.carrySpeed / sampleBase.withBall.carrySpeed;
    const techRatio = rt.withBall.passingSkill / sampleBase.withBall.passingSkill;
    expect(physRatio).toBeLessThan(techRatio);
  });
});

describe("applyStaminaCost", () => {
  test("deducts configured cost for one player by id", () => {
    const p = normalizeGamePlayer({
      id: 1,
      name: "X",
      team: "A",
      role: "CM",
      attackDir: 1,
      x: 0,
      y: 0,
      baseStats: sampleBase,
      runtimeStats: getRuntimeLineup(sampleBase, { energy: 100 }),
      energy: 100,
      stamina: 0,
      ballSupportScale: 0.5,
      slotIndex: 0,
      basePosition: { x: 0, y: 0 },
      targetPosition: { x: 0, y: 0 },
      bounds: { minX: 0, maxX: 100, minY: 0, maxY: 74 },
      recoveryTime: 0,
      decisionMemory: { path: "BALL_HOLDER", decision: null, commitTicks: 0 },
    } as GamePlayer);
    const out = applyStaminaCost([p], 1, "tackle");
    expect(out[0]!.energy).toBe(100 - STAMINA_COST.tackle);
  });
});

describe("normalizeGamePlayer", () => {
  test("maps legacy stats field to baseStats + runtimeStats", () => {
    const legacy = {
      id: 1,
      name: "X",
      team: "A" as const,
      role: "CM" as const,
      attackDir: 1 as const,
      x: 0,
      y: 0,
      stats: sampleBase,
      ballSupportScale: 0.5,
      slotIndex: 0,
      basePosition: { x: 0, y: 0 },
      targetPosition: { x: 0, y: 0 },
      bounds: { minX: 0, maxX: 100, minY: 0, maxY: 74 },
      recoveryTime: 0,
      decisionMemory: { path: "TEAM_WITH_BALL" as const, decision: null, commitTicks: 0 },
    };
    const p = normalizeGamePlayer(legacy as unknown as GamePlayer);
    expect(p.baseStats).toBe(sampleBase);
    expect(p.runtimeStats?.withBall.vision).toBeDefined();
    expect(p.energy).toBe(100);
    expect(p.stamina).toBe(7);
  });
});

describe("applyContinuousFatigue", () => {
  const runtimeAt100 = getRuntimeLineup(sampleBase, { energy: 100 });

  test("below the 1-point threshold, keeps the same runtimeStats reference and baseline", () => {
    const result = applyContinuousFatigue(sampleBase, runtimeAt100, 99.5, 100);
    expect(result.runtimeStats).toBe(runtimeAt100);
    expect(result.fatigueBaselineEnergy).toBe(100);
  });

  test("losing 3 energy points (< 10, would not have crossed the old step) recomputes runtimeStats", () => {
    const result = applyContinuousFatigue(sampleBase, runtimeAt100, 97, 100);
    expect(result.runtimeStats).not.toBe(runtimeAt100);
    expect(result.runtimeStats.withBall.carrySpeed).toBeLessThan(runtimeAt100.withBall.carrySpeed);
    expect(result.fatigueBaselineEnergy).toBe(97);
  });

  test("recomputed stats match a direct getRuntimeLineup call at the new energy", () => {
    const result = applyContinuousFatigue(sampleBase, runtimeAt100, 97, 100);
    expect(result.runtimeStats).toEqual(getRuntimeLineup(sampleBase, { energy: 97 }));
  });
});

describe("overallEnergyFactor", () => {
  test("full energy yields factor 1", () => {
    expect(overallEnergyFactor(100)).toBeCloseTo(1, 10);
  });

  test("decreases monotonically as energy drops", () => {
    const values = [100, 90, 75, 60, 40, 20, 0].map(overallEnergyFactor);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]!);
    }
  });

  test("at 60 energy sits between the physical (worst-hit) and tech (least-hit) single factors", () => {
    const factor = overallEnergyFactor(60);
    // Reference values from the fatigue curve doc: physical ~72% stats, tech ~90% stats at 60 energy.
    expect(factor).toBeGreaterThan(0.72);
    expect(factor).toBeLessThan(0.90);
    expect(factor).toBeCloseTo(0.787, 2);
  });

  test("never negative even at 0 energy", () => {
    expect(overallEnergyFactor(0)).toBeGreaterThanOrEqual(0);
  });
});
