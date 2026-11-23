import { afterEach, describe, expect, test } from "bun:test";
import { tickState } from "@/GameEngine/Domain/gameState";
import { normalizeGameState } from "@/GameEngine/Domain/RuntimeLineup";
import { SIM_STEP } from "@/GameEngine/Domain/advanceSim";
import { KINEMATICS_CONFIG } from "@/GameEngine/Configs/KinematicsConfig";
import { TEST_SCENARIOS } from "@/GameEngine/Support/TestCases";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import type { GameState } from "@/GameEngine/types";

/** Player kinematics in the engine (`.claude/rules/game-engine/kinematics.md`). */

const scenario = (id: string): GameState => normalizeGameState({ ...TEST_SCENARIOS.find(t => t.id === id)!.createState(), testMode: true, injuries: [], cards: [], substitutions: [] });
const byName = (s: GameState, name: string) => s.players.find(p => p.name === name)!;

afterEach(() => { KINEMATICS_CONFIG.ENABLED = true; });

describe("kinematics in the engine", () => {
  test("a standing striker builds up speed; the running CB keeps his", () => {
    let s = scenario("kin-sprint-stop");
    const x0 = byName(s, "Santos").x;
    s = tickState(s, SIM_STEP).state;
    const santos = byName(s, "Santos");
    const step1 = santos.x - x0;
    expect(step1).toBeGreaterThan(0);
    expect(step1 / SIM_STEP).toBeLessThan(santos.runtimeStats.withoutBall.pressSpeed * 0.5);
    // The CB started at 8 yd/s: his first step is a full-speed one.
    expect(Math.hypot(byName(s, "Silva").vel!.x, byName(s, "Silva").vel!.y)).toBeGreaterThan(7);
    const speeds: number[] = [];
    for (let i = 0; i < 8; i++) {
      s = tickState(s, SIM_STEP).state;
      const v = byName(s, "Santos").vel;
      if (v) speeds.push(Math.hypot(v.x, v.y));
    }
    expect(Math.max(...speeds)).toBeGreaterThan(step1 / SIM_STEP * 2);
  });

  test("a 180° turn cuts the top speed", () => {
    let s = scenario("kin-sharp-turn");
    let turned = false;
    for (let i = 0; i < 6 && !turned; i++) {
      s = tickState(s, SIM_STEP).state;
      const k = byName(s, "Silva").kin;
      if (k && k.turn < 0.8) turned = true;
    }
    expect(turned).toBe(true);
  });

  test("distance and sprints are emitted", () => {
    let yards = 0;
    const off = gameBus.on("playerMoved", e => { for (const [, d] of e.moves) yards += d; });
    let s = scenario("kin-sprint-stop");
    for (let i = 0; i < 5; i++) s = tickState(s, SIM_STEP).state;
    off();
    expect(yards).toBeGreaterThan(5);
  });

  test("the layer off moves at once at top speed (the engine before kinematics)", () => {
    KINEMATICS_CONFIG.ENABLED = false;
    let s = scenario("kin-sprint-stop");
    // The scenario starts with the ball loose and nobody committed: the chasers are picked during the first tick, so
    // that tick's step follows a fresh off-ball choice. Measure the next one, a committed chase.
    s = tickState(s, SIM_STEP).state;
    expect(byName(s, "Santos").decisionMemory?.decision?.type).toBe("chase_loose_ball");
    const x0 = byName(s, "Santos").x;
    s = tickState(s, SIM_STEP).state;
    const santos = byName(s, "Santos");
    expect((santos.x - x0) / SIM_STEP).toBeGreaterThan(santos.runtimeStats.withoutBall.pressSpeed * 0.9);
  });
});
