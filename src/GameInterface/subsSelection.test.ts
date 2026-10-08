import { describe, expect, test } from "bun:test";
import { tapSubsPlayer, type SubsTapContext } from "@/GameInterface/subsSelection";

const ctx = (over: Partial<SubsTapContext> = {}): SubsTapContext => ({
  canSub: true,
  isGoalkeeper: (id) => id === 1,
  isQueuedOut: () => false,
  ...over,
});

describe("tapSubsPlayer (#115)", () => {
  test("starter then bench queues a substitution", () => {
    const a = tapSubsPlayer(null, { kind: "starter", id: 5 }, ctx());
    expect(a).toEqual({ selection: { kind: "starter", id: 5 } });
    expect(tapSubsPlayer(a.selection, { kind: "bench", id: 20 }, ctx()))
      .toEqual({ selection: null, action: { type: "sub", outId: 5, inId: 20 } });
  });

  test("bench then starter also queues it", () => {
    expect(tapSubsPlayer({ kind: "bench", id: 20 }, { kind: "starter", id: 5 }, ctx()))
      .toEqual({ selection: null, action: { type: "sub", outId: 5, inId: 20 } });
  });

  test("two starters swap positions, never with the goalkeeper", () => {
    expect(tapSubsPlayer({ kind: "starter", id: 7 }, { kind: "starter", id: 11 }, ctx()))
      .toEqual({ selection: null, action: { type: "swap", aId: 7, bId: 11 } });
    expect(tapSubsPlayer({ kind: "starter", id: 7 }, { kind: "starter", id: 1 }, ctx()))
      .toEqual({ selection: { kind: "starter", id: 1 } });
  });

  test("no substitution left, or the starter already going off: the selection just moves", () => {
    expect(tapSubsPlayer({ kind: "starter", id: 5 }, { kind: "bench", id: 20 }, ctx({ canSub: false })))
      .toEqual({ selection: { kind: "bench", id: 20 } });
    expect(tapSubsPlayer({ kind: "bench", id: 20 }, { kind: "starter", id: 5 }, ctx({ isQueuedOut: (id) => id === 5 })))
      .toEqual({ selection: { kind: "starter", id: 5 } });
    // A swap still works without substitutions left.
    expect(tapSubsPlayer({ kind: "starter", id: 7 }, { kind: "starter", id: 11 }, ctx({ canSub: false })).action)
      .toEqual({ type: "swap", aId: 7, bId: 11 });
  });

  test("tapping the selected player clears; another bench player moves the selection", () => {
    expect(tapSubsPlayer({ kind: "starter", id: 5 }, { kind: "starter", id: 5 }, ctx())).toEqual({ selection: null });
    expect(tapSubsPlayer({ kind: "bench", id: 20 }, { kind: "bench", id: 21 }, ctx())).toEqual({ selection: { kind: "bench", id: 21 } });
  });
});
