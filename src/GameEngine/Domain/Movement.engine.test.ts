import { describe, expect, test } from "bun:test";
import { tickState } from "@/GameEngine/Domain/gameState";
import { TEST_SCENARIOS } from "@/GameEngine/Support/TestCases";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { setDecisionFlags } from "@/GameEngine/Configs/DecisionConfig";
import type { GameState } from "@/GameEngine/types";

// Stage 4 (`.claude/rules/game-engine/movement.md`): the /test scenarios show each mechanic.
function play(id: string, seconds: number, until?: (s: GameState) => boolean): GameState {
  const sc = TEST_SCENARIOS.find(t => t.id === id)!;
  let s: GameState = {
    injuries: [], cards: [], substitutions: [], pendingSubsA: [], pendingSubsB: [], benchA: [], benchB: [],
    subsRemainingA: 5, subsRemainingB: 5, ...sc.createState(), testMode: true,
  } as GameState;
  for (let i = 0; i < seconds / 0.2; i++) {
    s = tickState(s, 0.2).state;
    if (until?.(s)) break;
  }
  return s;
}

describe("movement scenarios", () => {
  test("an overhit through ball nobody reaches rolls out of play", () => {
    setDecisionFlags();
    const out: string[] = [];
    const off = gameBus.on("ballOutOfPlay", e => out.push(`${e.cause}:${e.kind}`));
    try {
      play("movement-rolling-ball", 8, s => !s.pass && !s.looseBall);
    } finally { off(); }
    expect(out.length).toBe(1);
    expect(out[0]).toMatch(/^overhit:/);
  });

  test("a pressed holder: his nearest midfielder comes short (the stand-off itself: Movement.test.ts)", () => {
    setDecisionFlags();
    let standOff = 0;
    let support = 0;
    const a = gameBus.on("pressStandOff", () => standOff++);
    const b = gameBus.on("supportShort", () => support++);
    try {
      play("movement-second-presser", 3);
    } finally { a(); b(); }
    expect(standOff).toBeGreaterThanOrEqual(0);
    expect(support).toBeGreaterThan(0);
  });

  test("the back line holds a state while team B defends; off, there is none", () => {
    setDecisionFlags();
    const on = play("movement-back-line", 2);
    expect(on.backLine?.B).toBeDefined();
    setDecisionFlags({ BACK_LINE: false });
    try {
      const off = play("movement-back-line", 2);
      expect(off.backLine?.B).toBeUndefined();
    } finally { setDecisionFlags(); }
  });
});
