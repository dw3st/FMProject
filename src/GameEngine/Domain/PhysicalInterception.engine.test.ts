import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { INTERCEPT } from "@/GameEngine/Configs/InterceptConfig";
import { tickState } from "@/GameEngine/Domain/gameState";
import { TEST_SCENARIOS } from "@/GameEngine/Support/TestCases";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { setDecisionFlags } from "@/GameEngine/Configs/DecisionConfig";
import type { GameState } from "@/GameEngine/types";

// Stage 5 (`.claude/rules/game-engine/interception.md` → "Stage 5"): no interception dice for a physical pass.
function start(id: string): GameState {
  const sc = TEST_SCENARIOS.find(t => t.id === id)!;
  const defaults: Partial<GameState> = {
    injuries: [], cards: [], substitutions: [], pendingSubsA: [], pendingSubsB: [], benchA: [], benchB: [],
    subsRemainingA: 5, subsRemainingB: 5,
  };
  return { ...defaults, ...sc.createState(), testMode: true } as GameState;
}

function play(id: string, seed?: number, max = 40) {
  const touches: { player: number; outcome: string; offset: number }[] = [];
  const dice: boolean[] = [];
  let ran = false;
  const offT = gameBus.on("interceptionTouch", e => touches.push(e));
  const offI = gameBus.on("interception", e => dice.push(e.success));
  let s = start(id);
  if (seed !== undefined) s = { ...s, rng: seed };
  try {
    for (let i = 0; i < max && s.pass; i++) {
      s = tickState(s, 0.2).state;
      if ((s.interceptRuns ?? []).some(r => r.playerId === 3)) ran = true;
    }
  } finally { offT(); offI(); }
  return { s, touches, dice, ran };
}

describe("physical interception", () => {
  // Stage 21 calibrated the defender's reach and reaction to FM's interception count (1.3 → 0.7 yd, 0.25 → 0.45 s); the
  // scenarios were drawn at the stage-5 values, so the tests keep them to check the mechanism.
  const saved = { REACH_BODY_YD: INTERCEPT.REACH_BODY_YD, REACTION_S: INTERCEPT.REACTION_S };
  beforeAll(() => { INTERCEPT.REACH_BODY_YD = 1.3; INTERCEPT.REACTION_S = 0.25; });
  afterAll(() => { Object.assign(INTERCEPT, saved); });
  test("a defender who reaches the path in time runs there and touches the ball", () => {
    setDecisionFlags();
    const r = play("pass-intercepted");
    expect(r.ran).toBe(true);
    expect(r.touches.length).toBeGreaterThanOrEqual(1);
    expect(r.touches[0]!.player).toBe(3);
    expect(r.s.pass).toBeNull();
  });

  test("the touch is the only draw: the outcome follows the match generator", () => {
    setDecisionFlags();
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const r = play("pass-intercepted", seed);
      if (r.touches[0]) outcomes.add(r.touches[0].outcome);
    }
    expect(outcomes.size).toBeGreaterThanOrEqual(2);
  });

  test("near his own goal a touch he meets cleanly but does not control is cleared, never deflected", () => {
    setDecisionFlags();
    let seen = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const r = play("pass-intercept-clear", seed);
      for (const t of r.touches) if (t.offset <= 0.6) expect(t.outcome).not.toBe("deflect");
      if (r.touches.some(t => t.outcome === "clear")) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });

  test("with the flag off the pass is cut by the old dice, nobody runs to the path", () => {
    setDecisionFlags({ PHYSICAL_INTERCEPTION: false });
    try {
      const r = play("pass-intercepted");
      expect(r.touches.length).toBe(0);
      expect(r.ran).toBe(false);
    } finally { setDecisionFlags(); }
  });
});
