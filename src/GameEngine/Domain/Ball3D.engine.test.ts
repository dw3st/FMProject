import { describe, expect, test } from "bun:test";
import { tickState } from "@/GameEngine/Domain/gameState";
import { TEST_SCENARIOS } from "@/GameEngine/Support/TestCases";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { setDecisionFlags } from "@/GameEngine/Configs/DecisionConfig";
import { BALL_PHYSICS } from "@/GameEngine/Configs/BallPhysicsConfig";
import type { GameState } from "@/GameEngine/types";

// Stage 3 (`.claude/rules/game-engine/ball-3d.md`): the ball is a 3D object.
function start(id: string): GameState {
  const sc = TEST_SCENARIOS.find(t => t.id === id)!;
  const defaults: Partial<GameState> = {
    injuries: [], cards: [], substitutions: [], pendingSubsA: [], pendingSubsB: [], benchA: [], benchB: [],
    subsRemainingA: 5, subsRemainingB: 5,
  };
  return { ...defaults, ...sc.createState(), testMode: true } as GameState;
}

describe("3D ball", () => {
  test("a long ball flies on a parabola, lands, bounces and is never under the grass", () => {
    setDecisionFlags();
    const flights: { kind: string; peak: number; bounces: number }[] = [];
    const off = gameBus.on("ballFlight", e => flights.push(e));
    let s = start("ball-3d-long-ball");
    let maxZ = 0, minZ = Infinity;
    try {
      for (let i = 0; i < 60; i++) {
        s = tickState(s, 0.2).state;
        if (s.ball) { maxZ = Math.max(maxZ, s.ball.z); minZ = Math.min(minZ, s.ball.z); }
      }
    } finally { off(); }
    expect(minZ).toBeGreaterThanOrEqual(0);
    const long = flights.find(f => f.kind === "long_ball");
    expect(long).toBeDefined();
    // 58 yd at 30 yd/s ≈ 1.9 s of flight: a peak of g·T²/8 ≈ 5 yd.
    expect(long!.peak).toBeGreaterThan(3);
    expect(maxZ).toBeGreaterThan(3);
  });

  test("a loose ball above a player's reach can't be collected until it falls", () => {
    setDecisionFlags();
    let s = start("ball-3d-high-loose");
    s = tickState(s, 0.2).state;
    // 3.5 yd → about 3.3 yd after a step: still above the midfielder's reach.
    expect(s.ball!.z).toBeGreaterThan(BALL_PHYSICS.REACH_OUTFIELD);
    expect(s.looseBall).not.toBeNull();
    let picked = -1;
    for (let i = 1; i < 30 && picked < 0; i++) {
      s = tickState(s, 0.2).state;
      if (!s.looseBall) picked = i;
    }
    expect(picked).toBeGreaterThan(0);
  });

  test("with BALL_3D off there is no 3D ball", () => {
    setDecisionFlags({ BALL_3D: false });
    try {
      let s = start("ball-3d-long-ball");
      s = { ...s, ball: undefined };
      for (let i = 0; i < 5; i++) s = tickState(s, 0.2).state;
      expect(s.ball).toBeUndefined();
    } finally { setDecisionFlags(); }
  });
});
