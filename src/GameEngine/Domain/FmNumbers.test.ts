import { describe, expect, test } from "bun:test";
import { passErrorSigma, passLaunch, passMissChance, passReach } from "@/GameEngine/Domain/PassError";
import { shotLevelMult } from "@/GameEngine/Domain/DecisionTree";
import { blockShiftX } from "@/GameEngine/Domain/AttackingPositioning";
import { DECISION_FLAGS } from "@/GameEngine/Configs/DecisionConfig";
import { FM_NUMBERS } from "@/GameEngine/Configs/FmNumbersConfig";

describe("pass launch error (stage 4b)", () => {
  test("error grows with distance and pressure, shrinks with technique", () => {
    const base = passErrorSigma(0.6, 20, 0);
    expect(passErrorSigma(0.6, 35, 0).side).toBeGreaterThan(base.side);
    expect(passErrorSigma(0.6, 20, 60).along).toBeGreaterThan(base.along);
    expect(passErrorSigma(0.9, 20, 0).along).toBeLessThan(base.along);
    expect(passErrorSigma(0.6, 20, 0, true).along).toBeGreaterThan(base.along);
  });
  test("a short pass almost never misses, a long pressured one often does", () => {
    expect(passMissChance(0.7, 8, 0, 0.6)).toBeLessThan(0.02);
    expect(passMissChance(0.4, 28, 80, 0.4)).toBeGreaterThan(passMissChance(0.4, 12, 0, 0.4));
  });
  test("launch uses the dice and the reach ellipse", () => {
    expect(passLaunch(0.6, 20, 0, 0.5, 0, 0).miss).toBe(false);
    const r = passReach(0.5);
    const big = passLaunch(0.6, 20, 0, 0.5, 50, 0);
    expect(Math.abs(big.along)).toBeGreaterThan(r.along);
    expect(big.miss).toBe(true);
  });
});

describe("shot level and block shift (stage 4b)", () => {
  test("defenders shoot rarely; each level × SHOT_LEVEL_STEP", () => {
    expect(shotLevelMult("CB")).toBeCloseTo(FM_NUMBERS.SHOT_RARELY_MULT);
    expect(shotLevelMult("ST")).toBe(1);
    expect(shotLevelMult("ST", 1)).toBeCloseTo(FM_NUMBERS.SHOT_LEVEL_STEP);
  });
  test("the block moves up with the ball, mirrored for the side attacking −x; 0 with the flag off", () => {
    const a = blockShiftX({ attackDir: 1 }, { x: 80, y: 37 });
    const b = blockShiftX({ attackDir: -1 }, { x: 35, y: 37 });
    expect(a).toBeGreaterThan(0);
    expect(b).toBeCloseTo(-a);
    const prev = DECISION_FLAGS.SLIDING_BLOCK;
    DECISION_FLAGS.SLIDING_BLOCK = false;
    try { expect(blockShiftX({ attackDir: 1 }, { x: 80, y: 37 })).toBe(0); } finally { DECISION_FLAGS.SLIDING_BLOCK = prev; }
  });
});
