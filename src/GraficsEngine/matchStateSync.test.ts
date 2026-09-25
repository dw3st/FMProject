import { describe, expect, test } from "bun:test";
import { reconcileMatchStateSync } from "@/GraficsEngine/matchStateSync";
import type { GameState } from "@/GameEngine/types";

/** Minimal fake state — reconcileMatchStateSync only reads matchPhase/matchTime
 * plus the four UI-owned fields it merges. Loosely typed on purpose so test
 * call sites can pass partial/simplified shapes (e.g. a bare `{ id }`
 * formation) without fighting the full `Formation`/`GameState` types. */
function fakeState(overrides: Record<string, unknown> = {}): GameState {
  return {
    matchPhase: "firstHalf",
    matchTime: 0,
    pendingSubsA: [],
    pendingSubsB: [],
    formationA: { id: "A" },
    formationB: { id: "B" },
    players: [],
    score: { A: 0, B: 0 },
    ...overrides,
  } as unknown as GameState;
}

describe("reconcileMatchStateSync", () => {
  test("adopts the incoming snapshot outright when it is strictly ahead", () => {
    const current  = fakeState({ matchTime: 10, players: ["current"] as never });
    const incoming = fakeState({ matchTime: 12, players: ["incoming"] as never });

    expect(reconcileMatchStateSync(current, incoming)).toBe(incoming);
  });

  test("adopts the incoming snapshot when matchTime is equal (e.g. paused, UI just queued a sub)", () => {
    const current  = fakeState({ matchTime: 10, players: ["current"] as never });
    const incoming = fakeState({
      matchTime: 10,
      players: ["current"] as never,
      pendingSubsA: [{ outId: 1, inId: 2 }] as never,
    });

    expect(reconcileMatchStateSync(current, incoming)).toBe(incoming);
  });

  test("a stale same-phase snapshot keeps current's simulation fields", () => {
    const current  = fakeState({ matchTime: 20, players: ["current"] as never, score: { A: 1, B: 0 } });
    const incoming = fakeState({ matchTime: 5, players: ["stale"] as never, score: { A: 0, B: 0 } });

    const result = reconcileMatchStateSync(current, incoming);

    expect(result.matchTime).toBe(20);
    expect(result.players).toEqual(["current"] as never);
    expect(result.score).toEqual({ A: 1, B: 0 });
  });

  test("a stale snapshot still contributes its UI-owned fields (pending subs, formation)", () => {
    const current  = fakeState({
      matchTime: 20,
      pendingSubsA: [],
      formationA: { id: "OLD" },
    });
    const incoming = fakeState({
      matchTime: 5,
      pendingSubsA: [{ outId: 1, inId: 2 }] as never,
      pendingSubsB: [{ outId: 3, inId: 4 }] as never,
      formationA: { id: "NEW" },
      formationB: { id: "NEW-B" },
    });

    const result = reconcileMatchStateSync(current, incoming);

    expect(result.pendingSubsA).toEqual([{ outId: 1, inId: 2 }] as never);
    expect(result.pendingSubsB).toEqual([{ outId: 3, inId: 4 }] as never);
    expect(result.formationA).toEqual({ id: "NEW" } as never);
    expect(result.formationB).toEqual({ id: "NEW-B" } as never);
  });

  test("a snapshot from an earlier matchPhase is stale even with a larger matchTime", () => {
    const current  = fakeState({ matchPhase: "secondHalf", matchTime: 5, players: ["current"] as never });
    const incoming = fakeState({ matchPhase: "firstHalf", matchTime: 2600, players: ["stale"] as never });

    const result = reconcileMatchStateSync(current, incoming);

    expect(result.matchPhase).toBe("secondHalf");
    expect(result.players).toEqual(["current"] as never);
  });

  test("a snapshot from a later matchPhase is adopted outright even with a smaller matchTime", () => {
    const current  = fakeState({ matchPhase: "firstHalf", matchTime: 2699 });
    const incoming = fakeState({ matchPhase: "halfTime", matchTime: 0 });

    expect(reconcileMatchStateSync(current, incoming)).toBe(incoming);
  });
});
