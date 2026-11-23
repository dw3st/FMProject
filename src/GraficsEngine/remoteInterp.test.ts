import { describe, expect, test } from "bun:test";
import {
  EMPTY_REMOTE_FRAMES, heldBallId, pushRemoteFrame, remoteAlpha, remoteBallHeight, remoteDrawnBall, remotePositions, toRemoteFrame, withFramePositions,
} from "@/GraficsEngine/remoteInterp";
import type { GameState } from "@/GameEngine/types";

const frame = (at: number, ball: [number, number], players: [number, number, number][]) => toRemoteFrame({ ball, players }, at);

describe("remoteAlpha", () => {
  test("elapsed over the step, limited to 0..1", () => {
    expect(remoteAlpha(1050, 1000, 100)).toBe(0.5);
    expect(remoteAlpha(990, 1000, 100)).toBe(0);
    expect(remoteAlpha(1300, 1000, 100)).toBe(1);
    expect(remoteAlpha(1000, 1000, 0)).toBe(1);
  });
});

describe("remotePositions", () => {
  test("null before the first frame; the only frame is drawn as is", () => {
    expect(remotePositions(EMPTY_REMOTE_FRAMES, 0, 100, 10)).toBeNull();
    const one = pushRemoteFrame(EMPTY_REMOTE_FRAMES, frame(0, [50, 30], [[1, 10, 20]]));
    expect(remotePositions(one, 500, 100, 10)).toEqual({ players: new Map([[1, { x: 10, y: 20 }]]), ball: { x: 50, y: 30 } });
  });

  test("blends the last two frames by the time since the newest", () => {
    let f = pushRemoteFrame(EMPTY_REMOTE_FRAMES, frame(1000, [50, 30], [[1, 10, 20], [2, 40, 40]]));
    f = pushRemoteFrame(f, frame(1100, [52, 30], [[1, 12, 20], [2, 40, 44], [3, 5, 5]]));
    expect(f.seq).toBe(2);
    const half = remotePositions(f, 1150, 100, 10)!;
    expect(half.players.get(1)).toEqual({ x: 11, y: 20 });
    expect(half.players.get(2)).toEqual({ x: 40, y: 42 });
    // A player new in the last frame (substitute) is drawn where he is.
    expect(half.players.get(3)).toEqual({ x: 5, y: 5 });
    expect(half.ball).toEqual({ x: 51, y: 30 });
    // A late frame freezes on the last one, never extrapolates.
    expect(remotePositions(f, 2000, 100, 10)!.players.get(1)).toEqual({ x: 12, y: 20 });
  });

  test("a jump bigger than the teleport limit is drawn at the new spot", () => {
    let f = pushRemoteFrame(EMPTY_REMOTE_FRAMES, frame(0, [57, 37], [[1, 10, 10]]));
    f = pushRemoteFrame(f, frame(100, [100, 37], [[1, 60, 40]]));
    const p = remotePositions(f, 110, 100, 10)!;
    expect(p.players.get(1)).toEqual({ x: 60, y: 40 });
    expect(p.ball).toEqual({ x: 100, y: 37 });
  });
});

describe("remoteBallHeight", () => {
  test("on the ground without a high flight", () => {
    expect(remoteBallHeight({ pass: null, shot: null }, { x: 1, y: 1 })).toBe(0);
  });

  test("a shot peaks halfway along its line and is grounded off it", () => {
    const shot = { shooterId: 1, fromX: 90, fromY: 37, toX: 115, toY: 37, t: 0, xg: 0.2 };
    const st = { pass: null, shot } as unknown as Pick<GameState, "pass" | "shot">;
    const mid = remoteBallHeight(st, { x: 102.5, y: 37 });
    expect(mid).toBeGreaterThan(0);
    expect(remoteBallHeight(st, { x: 95, y: 37 })).toBeLessThan(mid);
    expect(remoteBallHeight(st, { x: 102.5, y: 60 })).toBe(0);
  });

  test("a cross rises with the distance left to its target", () => {
    const pass = { fromId: 1, toId: null, toX: 108, toY: 37, kind: "cross", t: 0, distance: 30 };
    const st = { pass, shot: null } as unknown as Pick<GameState, "pass" | "shot">;
    expect(remoteBallHeight(st, { x: 108, y: 22 })).toBeGreaterThan(0);
    expect(remoteBallHeight(st, { x: 108, y: 37 })).toBe(0);
    expect(remoteBallHeight(st, { x: 20, y: 37 })).toBe(0);
  });
});

describe("withFramePositions", () => {
  test("moves the players of the frame, same object when nothing moved", () => {
    const state = { players: [{ id: 1, x: 1, y: 1 }, { id: 2, x: 5, y: 5 }] } as unknown as Pick<GameState, "players">;
    const moved = withFramePositions(state, frame(0, [0, 0], [[1, 3, 4]]));
    expect(moved.players[0]).toMatchObject({ id: 1, x: 3, y: 4 });
    expect(moved.players[1]).toBe(state.players[1]);
    expect(withFramePositions(state, frame(0, [0, 0], [[1, 1, 1], [2, 5, 5]]))).toBe(state);
  });
});

describe("heldBallId", () => {
  const players = new Map([[1, { x: 50, y: 30 }], [2, { x: 70, y: 40 }]]);
  const st = { pass: null, shot: null, looseBall: null, ballHolderId: 1 } as never;
  test("locally the state's holder", () => {
    expect(heldBallId(st, players, { x: 90, y: 10 }, false)).toBe(1);
  });
  test("remote: only while the drawn ball is at his feet (the state is up to a second old)", () => {
    expect(heldBallId(st, players, { x: 50.5, y: 30.5 }, true)).toBe(1);
    expect(heldBallId(st, players, { x: 60, y: 35 }, true)).toBeNull();
  });
  test("a ball in flight is nobody's", () => {
    expect(heldBallId({ ...(st as object), pass: {} } as never, players, { x: 50, y: 30 }, false)).toBeNull();
  });
});

describe("frames of many steps (stage 22)", () => {
  test("the ball follows the steps' path, not the straight line", () => {
    let f = pushRemoteFrame(EMPTY_REMOTE_FRAMES, frame(1000, [0, 0], [[1, 0, 0]]));
    // A pass out to (10, 10) and back to (0, 20) within one frame of 4 steps.
    f = pushRemoteFrame(f, toRemoteFrame({ ball: [0, 20], players: [[1, 12, 0]], steps: 4, path: [[5, 5], [10, 10], [5, 15]] }, 1200));
    const mid = remotePositions(f, 1300, 200, 4, 30)!;
    expect(mid.ball).toEqual({ x: 10, y: 10 });
    // The player moved 12 yards in 4 steps (over the 4-yard limit of one step): blended, the limit is per step.
    expect(mid.players.get(1)).toEqual({ x: 6, y: 0 });
  });

  test("a mode B jump is drawn as is", () => {
    let f = pushRemoteFrame(EMPTY_REMOTE_FRAMES, frame(1000, [0, 0], [[1, 0, 0]]));
    f = pushRemoteFrame(f, toRemoteFrame({ ball: [80, 30], players: [[1, 70, 30]], jump: true }, 1200));
    const r = remotePositions(f, 1250, 200, 4)!;
    expect(r.ball).toEqual({ x: 80, y: 30 });
    expect(r.players.get(1)).toEqual({ x: 70, y: 30 });
  });
});

describe("ball height in the frames (visual of the 90-minute engine)", () => {
  const wire = (x: number, z?: number) => ({ ball: [x, 30] as [number, number], ...(z === undefined ? {} : { ballZ: z }), players: [] as [number, number, number][] });
  test("the real height is blended between two frames", () => {
    const frames = { prev: toRemoteFrame(wire(10, 0), 0), last: toRemoteFrame(wire(12, 4), 200), seq: 2 };
    const r = remotePositions(frames, 300, 200, 4, 30)!;
    expect(r.ballZ).toBeCloseTo(2, 5);
    expect(remoteDrawnBall({ pass: null, shot: null }, r.ball, r.ballZ).h).toBeCloseTo(2, 5);
  });
  test("an older sender without the height keeps the arc", () => {
    const frames = { prev: toRemoteFrame(wire(10), 0), last: toRemoteFrame(wire(12), 200), seq: 2 };
    const r = remotePositions(frames, 300, 200, 4, 30)!;
    expect(r.ballZ).toBeUndefined();
    expect(remoteDrawnBall({ pass: null, shot: null }, r.ball, r.ballZ).h).toBe(0);
  });
});
