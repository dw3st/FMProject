import { describe, expect, test } from "bun:test";
import type { GameState } from "@/GameEngine/types";
import { drawnBall, drawnPlayerPositions, interpAlpha, lerpPos, samePositions } from "@/GraficsEngine/renderInterp";

function st(players: { id: number; x: number; y: number }[], extra: Partial<GameState> = {}): GameState {
  return { players, ballHolderId: players[0]?.id ?? null, pass: null, shot: null, looseBall: null, ...extra } as unknown as GameState;
}

describe("interpAlpha", () => {
  test("carry / step, limited to 0..1", () => {
    expect(interpAlpha(0, 1 / 60)).toBe(0);
    expect(interpAlpha(1 / 120, 1 / 60)).toBeCloseTo(0.5, 10);
    expect(interpAlpha(1, 1 / 60)).toBe(1);
    expect(interpAlpha(-1, 1 / 60)).toBe(0);
  });
});

describe("lerpPos", () => {
  test("respects alpha", () => {
    expect(lerpPos({ x: 0, y: 0 }, { x: 1, y: 2 }, 0, 4)).toEqual({ x: 0, y: 0 });
    expect(lerpPos({ x: 0, y: 0 }, { x: 1, y: 2 }, 0.5, 4)).toEqual({ x: 0.5, y: 1 });
    expect(lerpPos({ x: 0, y: 0 }, { x: 1, y: 2 }, 1, 4)).toEqual({ x: 1, y: 2 });
  });
  test("a jump above maxStep is drawn at the current position", () => {
    expect(lerpPos({ x: 0, y: 0 }, { x: 30, y: 0 }, 0.25, 4)).toEqual({ x: 30, y: 0 });
    expect(lerpPos({ x: 0, y: 0 }, { x: 4, y: 0 }, 0.25, 4)).toEqual({ x: 1, y: 0 });
  });
});

describe("drawnPlayerPositions", () => {
  test("interpolates by id; a player missing from prev is drawn where he is", () => {
    const prev = st([{ id: 1, x: 10, y: 10 }, { id: 2, x: 20, y: 20 }]);
    const cur = st([{ id: 2, x: 22, y: 20 }, { id: 1, x: 11, y: 10 }, { id: 3, x: 50, y: 30 }]);
    const m = drawnPlayerPositions(prev, cur, 0.5, 4);
    expect(m.get(1)).toEqual({ x: 10.5, y: 10 });
    expect(m.get(2)).toEqual({ x: 21, y: 20 });
    expect(m.get(3)).toEqual({ x: 50, y: 30 });
    expect(m.size).toBe(3);
  });
  test("a teleported player (kickoff) is not smoothed", () => {
    const m = drawnPlayerPositions(st([{ id: 1, x: 100, y: 10 }]), st([{ id: 1, x: 57, y: 37 }]), 0.3, 4);
    expect(m.get(1)).toEqual({ x: 57, y: 37 });
  });
});

describe("drawnBall", () => {
  test("follows the holder between steps, on the ground", () => {
    const b = drawnBall(st([{ id: 1, x: 10, y: 10 }]), st([{ id: 1, x: 12, y: 10 }]), 0.5, 4);
    expect(b).toEqual({ x: 11, y: 10, h: 0 });
  });
  test("a teleported ball draws the current position and height", () => {
    const b = drawnBall(st([{ id: 1, x: 100, y: 10 }]), st([{ id: 1, x: 57, y: 37 }]), 0.5, 4);
    expect(b).toEqual({ x: 57, y: 37, h: 0 });
  });
  test("the same state draws exactly the current ball", () => {
    const s = st([{ id: 1, x: 10, y: 10 }]);
    expect(drawnBall(s, s, 0.4, 4)).toEqual({ x: 10, y: 10, h: 0 });
  });
});

describe("samePositions", () => {
  test("same spots in a different object → true; a moved player → false", () => {
    const a = st([{ id: 1, x: 10, y: 10 }, { id: 2, x: 5, y: 5 }]);
    expect(samePositions(a, { ...a, players: a.players.map((p) => ({ ...p })) })).toBe(true);
    expect(samePositions(a, st([{ id: 1, x: 10, y: 10 }, { id: 2, x: 6, y: 5 }]))).toBe(false);
    expect(samePositions(a, st([{ id: 1, x: 10, y: 10 }]))).toBe(false);
  });
});
