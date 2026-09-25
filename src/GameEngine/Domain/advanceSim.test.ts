import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "node:url";
import { advanceSim, SIM_STEP } from "@/GameEngine/Domain/advanceSim";
import { createMatchState, type TickResult } from "@/GameEngine/Domain/gameState";
import type { Formation, GameState, MatchPhase } from "@/GameEngine/types";
import type { Squad } from "@/types/playerTypes";

/** Minimal fake state — advanceSim only reads `matchPhase` off it. */
function fakeState(matchPhase: MatchPhase = "firstHalf"): GameState {
  return { matchPhase } as unknown as GameState;
}

/** Records every dt passed to it; never scores, never changes phase. */
function makeNoopTick() {
  const calls: number[] = [];
  const tick = (state: GameState, dt: number): TickResult => {
    calls.push(dt);
    return { state, passCompleted: false, tackled: false, goalScored: null };
  };
  return { tick, calls };
}

describe("advanceSim", () => {
  test("zero seconds is a no-op", () => {
    const state = fakeState();
    const { tick, calls } = makeNoopTick();

    const result = advanceSim(state, 0, SIM_STEP, tick);

    expect(result.state).toBe(state);
    expect(result.consumedAll).toBe(true);
    expect(result.stoppedBy).toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  test("negative seconds is also a no-op", () => {
    const state = fakeState();
    const { tick, calls } = makeNoopTick();

    const result = advanceSim(state, -1, SIM_STEP, tick);

    expect(result.state).toBe(state);
    expect(result.consumedAll).toBe(true);
    expect(calls).toHaveLength(0);
  });

  test("consumes in fixed steps of `step`, exact multiple", () => {
    const state = fakeState();
    const { tick, calls } = makeNoopTick();

    const result = advanceSim(state, 3 * SIM_STEP, SIM_STEP, tick);

    expect(calls).toHaveLength(3);
    for (const dt of calls) expect(dt).toBeCloseTo(SIM_STEP, 12);
    expect(result.consumedAll).toBe(true);
    expect(result.stoppedBy).toBeUndefined();
  });

  test("consumes a non-multiple amount with a smaller final step", () => {
    const state = fakeState();
    const { tick, calls } = makeNoopTick();

    const result = advanceSim(state, 2.5 * SIM_STEP, SIM_STEP, tick);

    expect(calls).toHaveLength(3);
    expect(calls[0]).toBeCloseTo(SIM_STEP, 12);
    expect(calls[1]).toBeCloseTo(SIM_STEP, 12);
    expect(calls[2]).toBeCloseTo(0.5 * SIM_STEP, 12);
    expect(result.consumedAll).toBe(true);
  });

  test("a large elapsed amount runs many fixed steps (e.g. background-tab pulse at 4x)", () => {
    const state = fakeState();
    const { tick, calls } = makeNoopTick();

    // 5s real-time cap × 4x game speed = 20 game-seconds of accumulated time.
    const result = advanceSim(state, 20, SIM_STEP, tick);

    expect(calls).toHaveLength(Math.round(20 / SIM_STEP));
    expect(result.consumedAll).toBe(true);
  });

  test("stops early the moment a step scores a goal, discarding the rest", () => {
    const state = fakeState();
    let n = 0;
    const tick = (s: GameState, _dt: number): TickResult => {
      n++;
      const goalScored = n === 2 ? "A" : null;
      return { state: s, passCompleted: false, tackled: false, goalScored };
    };

    const result = advanceSim(state, 10 * SIM_STEP, SIM_STEP, tick);

    expect(n).toBe(2);
    expect(result.consumedAll).toBe(false);
    expect(result.stoppedBy).toBe("goal");
  });

  test("stops early the moment a step changes matchPhase, discarding the rest", () => {
    const state = fakeState("firstHalf");
    let n = 0;
    const tick = (s: GameState, _dt: number): TickResult => {
      n++;
      const nextState = n === 3 ? fakeState("halfTime") : s;
      return { state: nextState, passCompleted: false, tackled: false, goalScored: null };
    };

    const result = advanceSim(state, 10 * SIM_STEP, SIM_STEP, tick);

    expect(n).toBe(3);
    expect(result.consumedAll).toBe(false);
    expect(result.stoppedBy).toBe("phase");
    expect(result.state.matchPhase).toBe("halfTime");
  });

  test("does not treat the very first step's phase as a change (baseline is per-step, not fixed at call time)", () => {
    const state = fakeState("firstHalf");
    // Every step reports the same phase it started with — never differs from the
    // phase immediately before that step — so it should run to full completion.
    const { tick, calls } = makeNoopTick();

    const result = advanceSim(state, 5 * SIM_STEP, SIM_STEP, tick);

    expect(calls).toHaveLength(5);
    expect(result.consumedAll).toBe(true);
  });
});

describe("advanceSim against the real engine", () => {
  function loadSquad(file: string): Squad {
    const path = fileURLToPath(
      new URL(`../../example_data/squads/premier_league/${file}`, import.meta.url),
    );
    return JSON.parse(readFileSync(path, "utf8")) as Squad;
  }

  const DEFAULT_FORMATION: Formation = {
    id: "4-3-3",
    attacking: [
      { role: "GK", x: 10, y: 37 },
      { role: "LB", x: 36, y: 11 },
      { role: "CB", x: 38, y: 28 },
      { role: "CB", x: 38, y: 46 },
      { role: "RB", x: 36, y: 63 },
      { role: "CM", x: 72, y: 24 },
      { role: "CM", x: 72, y: 50 },
      { role: "CAM", x: 78, y: 37 },
      { role: "LW", x: 95, y: 8 },
      { role: "ST", x: 98, y: 37 },
      { role: "RW", x: 95, y: 66 },
    ],
    defending: [
      { role: "GK", x: 5, y: 37 },
      { role: "LB", x: 13, y: 11 },
      { role: "CB", x: 14, y: 28 },
      { role: "CB", x: 14, y: 46 },
      { role: "RB", x: 13, y: 63 },
      { role: "CM", x: 38, y: 24 },
      { role: "CM", x: 38, y: 50 },
      { role: "CAM", x: 36, y: 37 },
      { role: "LW", x: 50, y: 8 },
      { role: "ST", x: 60, y: 37 },
      { role: "RW", x: 50, y: 66 },
    ],
  };

  test("advances a real match by an accumulated pulse without throwing, and reports consumedAll unless a goal/phase boundary was hit", () => {
    const squadA = loadSquad("33.json");
    const squadB = loadSquad("34.json");
    const initial: GameState = {
      ...createMatchState(squadA.players, DEFAULT_FORMATION, squadB.players, DEFAULT_FORMATION),
      matchPhase: "firstHalf",
      presentationCountdown: 0,
    };

    // Simulate one simClock pulse: 100ms real-time × 2x game speed × TIME_SCALE
    // isn't relevant here — advanceSim takes game-seconds directly. A generous
    // multi-second batch exercises many fixed steps, same as a coalesced
    // background-tab pulse would.
    const result = advanceSim(initial, 8);

    expect(result.state).toBeTruthy();
    expect(["firstHalf", "halfTime", "secondHalf", "matchEnd"]).toContain(result.state.matchPhase);
    if (result.consumedAll) {
      expect(result.stoppedBy).toBeUndefined();
    } else {
      expect(["goal", "phase"]).toContain(result.stoppedBy ?? "");
    }
  }, 30_000);
});
