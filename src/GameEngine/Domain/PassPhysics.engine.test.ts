import { describe, expect, test } from "bun:test";
import { tickState } from "@/GameEngine/Domain/gameState";
import { TEST_SCENARIOS } from "@/GameEngine/Support/TestCases";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { setDecisionFlags } from "@/GameEngine/Configs/DecisionConfig";
import { BALL_PHYSICS } from "@/GameEngine/Configs/BallPhysicsConfig";
import type { GameState } from "@/GameEngine/types";

// Stage 4 (`.claude/rules/game-engine/pass-physics.md`): a pass is a physical launch.
function start(id: string): GameState {
  const sc = TEST_SCENARIOS.find(t => t.id === id)!;
  const defaults: Partial<GameState> = {
    injuries: [], cards: [], substitutions: [], pendingSubsA: [], pendingSubsB: [], benchA: [], benchB: [],
    subsRemainingA: 5, subsRemainingB: 5,
  };
  return { ...defaults, ...sc.createState(), testMode: true } as GameState;
}

/** Ticks until the pass of the scenario is over; the state then and the ticks it took. */
function playPass(s: GameState, max = 40): { s: GameState; ticks: number; maxZ: number } {
  let maxZ = 0;
  for (let i = 1; i <= max; i++) {
    s = tickState(s, 0.2).state;
    if (s.ball) maxZ = Math.max(maxZ, s.ball.z);
    if (!s.pass) return { s, ticks: i, maxZ };
  }
  return { s, ticks: max, maxZ };
}

describe("physical pass", () => {
  test("a ground pass reaches the receiver on its own physics", () => {
    setDecisionFlags();
    const launched: { type: string }[] = [];
    const off = gameBus.on("passLaunched", e => launched.push(e));
    let r;
    try { r = playPass(start("pass-physics-ground")); } finally { off(); }
    expect(r.s.pass).toBeNull();
    expect(r.s.looseBall).toBeNull();
    expect(r.s.ballHolderId).toBe(2);
    // ~18 yd at FM's 7 + 0.45·d m/s: about a second, not the old 28 yd/s (0.65 s) nor more than 2 s.
    expect(r.ticks).toBeGreaterThanOrEqual(3);
    expect(r.ticks).toBeLessThanOrEqual(10);
    expect(r.maxZ).toBeLessThan(BALL_PHYSICS.REACH_OUTFIELD);
  });

  test("a chipped pass rises with its distance", () => {
    setDecisionFlags();
    const r = playPass(start("pass-physics-chip"));
    expect(r.maxZ).toBeGreaterThan(1.0);
  });

  test("an off-target pass runs past the receiver as a loose ball", () => {
    setDecisionFlags();
    const missed: number[] = [];
    const off = gameBus.on("passMissed", e => missed.push(e.player));
    let r;
    try { r = playPass(start("pass-physics-off-target")); } finally { off(); }
    expect(missed).toEqual([1]);
    expect(r.s.looseBall?.cause).toBe("misplaced");
    expect(Math.hypot(r.s.looseBall!.vx, r.s.looseBall!.vy)).toBeGreaterThan(3);
  });

  test("with PASS_PHYSICS off the pass keeps the engine's flight time", () => {
    setDecisionFlags({ PASS_PHYSICS: false });
    try {
      const s0 = start("pass-physics-ground");
      const r = playPass(s0);
      // 28 yd/s on an 18-yd pass: 0.65 s, 4 ticks.
      expect(r.ticks).toBe(Math.ceil(s0.pass!.distance / 28 / 0.2));
      expect(r.s.ballHolderId).toBe(2);
    } finally { setDecisionFlags(); }
  });
});
