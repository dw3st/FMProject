import { describe, expect, test } from "bun:test";
import { computeShotAim } from "@/GameEngine/Infrastructure/ActionOutcomes";
import { GOAL_Y_MAX, GOAL_Y_MIN } from "@/GameEngine/Domain/pitch";
import type { GamePlayer } from "@/GameEngine/types";

const shooter = (x: number, accuracy = 0.5) => ({
  x, y: 37, attackDir: 1, runtimeStats: { withBall: { shootAccuracy: accuracy } },
}) as unknown as GamePlayer;

function onTarget(p: GamePlayer, opts = {}): number {
  let n = 0;
  for (let i = 0; i < 4000; i++) {
    const { toY } = computeShotAim(p, opts);
    if (toY >= GOAL_Y_MIN && toY <= GOAL_Y_MAX) n++;
  }
  return n / 4000;
}

describe("computeShotAim", () => {
  test("close shots rarely miss, far shots keep the full spread", () => {
    expect(onTarget(shooter(109))).toBeGreaterThan(0.85);
    expect(onTarget(shooter(85))).toBeGreaterThan(0.45);
    expect(onTarget(shooter(85))).toBeLessThan(0.55);
  });
  test("an open goal is hard to miss, a free kick keeps its calibrated spread", () => {
    expect(onTarget(shooter(100), { keeperOut: true })).toBeGreaterThan(onTarget(shooter(100)));
    expect(onTarget(shooter(100), { keeperOut: true })).toBeGreaterThan(0.8);
    expect(onTarget(shooter(100), { fixedRange: true })).toBeLessThan(0.55);
  });
});
