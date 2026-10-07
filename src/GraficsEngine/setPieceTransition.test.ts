import { describe, expect, test } from "bun:test";
import type { GameState, SetPiece } from "@/GameEngine/types";
import {
  SET_PIECE_TRANSITION, blendBall, blendPlayers, easeInOut, isSetPieceStart, startTransition,
  transitionActive, transitionProgress, transitionSeconds,
} from "@/GraficsEngine/setPieceTransition";

function st(setPiece: SetPiece | null, matchPhase: GameState["matchPhase"] = "firstHalf"): GameState {
  return { setPiece, matchPhase } as unknown as GameState;
}
const corner: SetPiece = { type: "corner", takerId: 7, countdown: 1.2, position: { x: 115, y: 0 }, variant: "box" };

describe("isSetPieceStart", () => {
  test("open play → corner starts a transition", () => {
    expect(isSetPieceStart(st(null), st(corner))).toBe(true);
  });
  test("the same restart draining its countdown does not", () => {
    expect(isSetPieceStart(st(corner), st({ ...corner, countdown: 0.9 }))).toBe(false);
  });
  test("a different restart right after one does", () => {
    expect(isSetPieceStart(st({ ...corner, countdown: 0 }), st({ ...corner, takerId: 9, position: { x: 115, y: 74 } }))).toBe(true);
  });
  test("kickoff, a played restart (countdown 0), a phase change and a dead phase never do", () => {
    expect(isSetPieceStart(st(null), st({ type: "kickoff", takerId: 1, countdown: 2 }))).toBe(false);
    expect(isSetPieceStart(st(null), st({ ...corner, countdown: 0 }))).toBe(false);
    expect(isSetPieceStart(st(null, "firstHalf"), st(corner, "secondHalf"))).toBe(false);
    expect(isSetPieceStart(st(null, "halfTime"), st(corner, "halfTime"))).toBe(false);
  });
});

describe("transitionSeconds", () => {
  test("capped at MAX_SECONDS at 1×", () => {
    expect(transitionSeconds(1.2, 1)).toBe(SET_PIECE_TRANSITION.MAX_SECONDS);
  });
  test("always ends before the countdown at a higher speed", () => {
    const s = transitionSeconds(1.2, 4);
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(1.2 / 4);
    expect(transitionSeconds(1, 2)).toBeLessThan(1 / 2);
  });
  test("too short to bother → 0", () => {
    expect(transitionSeconds(0.2, 4)).toBe(0);
    expect(transitionSeconds(0, 1)).toBe(0);
    expect(transitionSeconds(1, 0)).toBe(0);
  });
});

describe("progress and blending", () => {
  test("ease is 0 → 0.5 → 1 and monotonic", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(2)).toBe(1);
    let last = -1;
    for (let t = 0; t <= 1; t += 0.05) { const v = easeInOut(t); expect(v).toBeGreaterThanOrEqual(last); last = v; }
  });
  test("a paused clock (same now) keeps the progress", () => {
    const tr = startTransition(new Map(), { x: 0, y: 0, h: 0 }, 10, 0.8)!;
    expect(transitionProgress(tr, 10.4)).toBeCloseTo(0.5);
    expect(transitionProgress(tr, 10.4)).toBe(transitionProgress(tr, 10.4));
  });
  test("active only while running and the restart is still frozen", () => {
    const tr = startTransition(new Map(), { x: 0, y: 0, h: 0 }, 0, 0.5);
    expect(transitionActive(tr, 0.2, st(corner))).toBe(true);
    expect(transitionActive(tr, 0.5, st(corner))).toBe(false);
    expect(transitionActive(tr, 0.2, st({ ...corner, countdown: 0 }))).toBe(false);
    expect(transitionActive(tr, 0.2, st(null))).toBe(false);
    expect(startTransition(new Map(), { x: 0, y: 0, h: 0 }, 0, 0)).toBeNull();
  });
  test("blend players and ball; a substitute is drawn at its target", () => {
    const from = new Map([[1, { x: 0, y: 0 }]]);
    const to = new Map([[1, { x: 10, y: 20 }], [2, { x: 5, y: 5 }]]);
    const mid = blendPlayers(from, to, 0.5);
    expect(mid.get(1)).toEqual({ x: 5, y: 10 });
    expect(mid.get(2)).toEqual({ x: 5, y: 5 });
    expect(blendPlayers(from, to, 1).get(1)).toEqual({ x: 10, y: 20 });
    expect(blendBall({ x: 0, y: 0, h: 2 }, { x: 10, y: 0, h: 0 }, 0.25)).toEqual({ x: 2.5, y: 0, h: 1.5 });
  });
});
