import { afterEach, describe, expect, test } from "bun:test";
import { forceMatchRandom } from "@/GameEngine/Infrastructure/MatchRng";
import { gameBus } from "@/GameEngine/Infrastructure/EventBus";
import { tickState } from "@/GameEngine/Domain/gameState";
import { TEST_SCENARIOS } from "@/GameEngine/Support/TestCases";
import { mulberry32 } from "@/Domain/rng";
import { DECISION_FLAGS } from "@/GameEngine/Configs/DecisionConfig";
import type { GameState } from "@/GameEngine/types";

afterEach(() => { forceMatchRandom(null); });

type End = "goal" | "saved" | "blocked" | "off";

/** Plays a stage-7 scenario until its shot ends; the outcome from the events (no xG dice anywhere). */
function playShot(id: string, seed: number): { end: End | null; launched: boolean; start: GameState } {
  forceMatchRandom(mulberry32(seed));
  const scen = TEST_SCENARIOS.find(s => s.id === id)!;
  const defaults: Partial<GameState> = {
    injuries: [], cards: [], substitutions: [], pendingSubsA: [], pendingSubsB: [], benchA: [], benchB: [],
    subsRemainingA: 5, subsRemainingB: 5,
  };
  let s = { ...defaults, ...scen.createState(), testMode: true } as GameState;
  const start = s;
  let end: End | null = null;
  const off = [
    gameBus.on("shotBlocked", () => { end ??= "blocked"; }),
    gameBus.on("shotResolved", e => { end ??= e.isGoal ? "goal" : e.outcome === "saved" ? "saved" : "off"; }),
  ];
  for (let i = 0; i < 40 && s.shot && !end; i++) s = tickState(s, 0.2).state;
  off.forEach(f => f?.());
  return { end, launched: !!start.shot?.physics, start };
}

describe("the shot by its trajectory (stage 7)", () => {
  test("the scenarios strike a physical shot", () => {
    if (!DECISION_FLAGS.SHOT_PHYSICS || !DECISION_FLAGS.BALL_3D) return;
    for (const id of ["shot-blocked", "shot-long-range", "shot-lob"]) {
      const r = playShot(id, 1);
      expect(r.launched).toBe(true);
    }
  });

  test("a defender on the line blocks some, a free shot from 28 yd is never blocked, every shot ends", () => {
    if (!DECISION_FLAGS.SHOT_PHYSICS || !DECISION_FLAGS.BALL_3D) return;
    const tally = (id: string) => {
      const c: Record<string, number> = {};
      for (let seed = 1; seed <= 40; seed++) { const e = playShot(id, seed).end ?? "none"; c[e] = (c[e] ?? 0) + 1; }
      return c;
    };
    const blocked = tally("shot-blocked");
    const long = tally("shot-long-range");
    expect(blocked.blocked ?? 0).toBeGreaterThan(0);
    expect(long.blocked ?? 0).toBe(0);
    expect(long.none ?? 0).toBe(0);
    expect((long.saved ?? 0) + (long.off ?? 0)).toBeGreaterThan(long.goal ?? 0);
  });

  test("the lob goes over the advanced keeper", () => {
    if (!DECISION_FLAGS.SHOT_PHYSICS || !DECISION_FLAGS.BALL_3D) return;
    const r = playShot("shot-lob", 3);
    const ph = r.start.shot!.physics!;
    expect(ph.technique).toBe("lob");
    expect(ph.vz).toBeGreaterThan(5);
  });
});
