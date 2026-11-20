import { describe, expect, test } from "bun:test";
import { tickState } from "@/GameEngine/Domain/gameState";
import { TEST_SCENARIOS } from "@/GameEngine/Support/TestCases";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { setDecisionFlags } from "@/GameEngine/Configs/DecisionConfig";
import type { GameState } from "@/GameEngine/types";

// Stage 15 (`.claude/rules/game-engine/team-shape.md`): the /test scenarios show the mechanics; off, none of them fires.
function play(id: string, seconds: number): GameState {
  const sc = TEST_SCENARIOS.find(t => t.id === id)!;
  const defaults: Partial<GameState> = {
    injuries: [], cards: [], substitutions: [], pendingSubsA: [], pendingSubsB: [], benchA: [], benchB: [],
    subsRemainingA: 5, subsRemainingB: 5,
  };
  let s: GameState = { ...defaults, ...sc.createState(), testMode: true } as GameState;
  for (let i = 0; i < seconds / 0.2; i++) s = tickState(s, 0.2).state;
  return s;
}

function count(fn: () => void): Record<string, number> {
  const n: Record<string, number> = { shadowPress: 0, pressState: 0, zoneCover: 0, shoulderRun: 0 };
  const offs = Object.keys(n).map(k => gameBus.on(k as "shadowPress", () => { n[k]!++; }));
  try { fn(); } finally { offs.forEach(o => o()); }
  return n;
}

describe("team shape scenarios", () => {
  test("the deep holder: pressing states are read every defending tick", () => {
    setDecisionFlags();
    const n = count(() => play("fm-shape-shadow", 3));
    expect(n.pressState).toBeGreaterThan(0);
  });

  test("off, no stage 15 event fires", () => {
    setDecisionFlags({ FM_SHAPE: false, OOP_ZONES: false, PASS_SHADOW: false, ACTION_HOLD: false, SHOULDER_RUNS: false });
    try {
      const n = count(() => { play("fm-shape-shadow", 3); play("shoulder-run", 3); });
      expect((n.shadowPress ?? 0) + (n.zoneCover ?? 0) + (n.shoulderRun ?? 0)).toBe(0);
    } finally { setDecisionFlags(); }
  });
});
