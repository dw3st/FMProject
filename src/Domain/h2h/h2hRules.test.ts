import { describe, expect, test } from "bun:test";
import { H2H } from "@/Domain/h2h/h2hConfig";
import {
  canPause, canResume, closeRoom, endPause, finishRoom, joinRoom, leaveRoom, newRoom,
  parseH2HCommand, pauseExpired, roomView, setReady, startPause, type H2HRoom,
} from "@/Domain/h2h/h2hRules";

const T0 = 1_000_000;

function room(): H2HRoom {
  return newRoom({
    saveId: "s1", fixtureId: "f1", date: "2027-03-01",
    sides: {
      A: { seatId: "a", nickname: "Ana", clubId: "33", clubName: "Home" },
      B: { seatId: "b", nickname: null, clubId: "40", clubName: "Away" },
    },
  });
}

function liveRoom(): H2HRoom {
  let r = joinRoom(room(), "A").room;
  r = joinRoom(r, "B").room;
  r = setReady(r, "A").room;
  return setReady(r, "B").room;
}

describe("room lobby", () => {
  test("new room is in the lobby with both away and full pauses", () => {
    const r = room();
    expect(r.phase).toBe("lobby");
    expect(r.sides.A.status).toBe("away");
    expect(r.sides.B.pausesLeft).toBe(H2H.PAUSES);
    expect(r.pause).toBeNull();
  });

  test("join marks the side in and connected", () => {
    const { room: r, start } = joinRoom(room(), "A");
    expect(start).toBe(false);
    expect(r.sides.A).toMatchObject({ status: "in", connected: true });
    expect(r.sides.B.status).toBe("away");
  });

  test("ready from away does nothing", () => {
    const base = room();
    const { room: r, start } = setReady(base, "A");
    expect(start).toBe(false);
    expect(r).toBe(base);
  });

  test("starts only when both are ready in the lobby", () => {
    let r = joinRoom(room(), "A").room;
    r = joinRoom(r, "B").room;
    const first = setReady(r, "A");
    expect(first.start).toBe(false);
    expect(first.room.phase).toBe("lobby");
    const second = setReady(first.room, "B");
    expect(second.start).toBe(true);
    expect(second.room.phase).toBe("live");
    expect(setReady(second.room, "A").start).toBe(false);
  });

  test("leaving in the lobby goes back to away", () => {
    let r = joinRoom(room(), "A").room;
    r = setReady(r, "A").room;
    const { room: left, start } = leaveRoom(r, "A");
    expect(start).toBe(false);
    expect(left.sides.A).toMatchObject({ status: "away", connected: false });
  });

  test("leaving a live match only disconnects; rejoining reconnects", () => {
    const left = leaveRoom(liveRoom(), "B").room;
    expect(left.phase).toBe("live");
    expect(left.sides.B).toMatchObject({ status: "ready", connected: false });
    expect(joinRoom(left, "B").room.sides.B).toMatchObject({ status: "ready", connected: true });
  });

  test("finished or closed rooms ignore joins and clear the pause", () => {
    const paused = startPause(liveRoom(), "A", T0);
    const done = finishRoom(paused);
    expect(done.phase).toBe("done");
    expect(done.pause).toBeNull();
    expect(joinRoom(done, "A").room).toBe(done);
    const closed = closeRoom(room());
    expect(closed.phase).toBe("closed");
    expect(joinRoom(closed, "B").room).toBe(closed);
  });
});

describe("pauses", () => {
  test("no pause outside a live match", () => {
    expect(canPause(room(), "A", T0)).toBe(false);
    expect(startPause(room(), "A", T0).pause).toBeNull();
  });

  test("a pause lasts 30 s and costs one", () => {
    const r = startPause(liveRoom(), "A", T0);
    expect(r.pause).toEqual({ by: "A", until: T0 + H2H.PAUSE_SECONDS * 1000 });
    expect(r.sides.A.pausesLeft).toBe(H2H.PAUSES - 1);
    expect(r.sides.B.pausesLeft).toBe(H2H.PAUSES);
  });

  test("no second pause while one is active", () => {
    const r = startPause(liveRoom(), "A", T0);
    expect(canPause(r, "B", T0 + 1)).toBe(false);
    expect(startPause(r, "B", T0 + 1)).toBe(r);
  });

  test("three pauses per manager", () => {
    let r = liveRoom();
    for (let i = 0; i < H2H.PAUSES; i++) {
      expect(canPause(r, "A", T0)).toBe(true);
      r = endPause(startPause(r, "A", T0));
    }
    expect(r.sides.A.pausesLeft).toBe(0);
    expect(canPause(r, "A", T0)).toBe(false);
    expect(canPause(r, "B", T0)).toBe(true);
  });

  test("only the pauser resumes early, before the pause runs out", () => {
    const r = startPause(liveRoom(), "A", T0);
    expect(canResume(r, "A", T0 + 5000)).toBe(true);
    expect(canResume(r, "B", T0 + 5000)).toBe(false);
    expect(canResume(r, "A", T0 + 30_000)).toBe(false);
    expect(canResume(liveRoom(), "A", T0)).toBe(false);
    expect(endPause(r).pause).toBeNull();
  });

  test("pause expiry", () => {
    const r = startPause(liveRoom(), "B", T0);
    expect(pauseExpired(r, T0 + 29_999)).toBe(false);
    expect(pauseExpired(r, T0 + 30_000)).toBe(true);
    expect(pauseExpired(liveRoom(), T0)).toBe(false);
  });
});

describe("roomView", () => {
  test("copies the room state", () => {
    const r = startPause(liveRoom(), "A", T0);
    const v = roomView(r);
    expect(v).toEqual({
      saveId: "s1", fixtureId: "f1", date: "2027-03-01", phase: "live",
      sides: {
        A: { seatId: "a", nickname: "Ana", clubId: "33", clubName: "Home", status: "ready", pausesLeft: 2, connected: true },
        B: { seatId: "b", nickname: null, clubId: "40", clubName: "Away", status: "ready", pausesLeft: 3, connected: true },
      },
      pause: { by: "A", until: T0 + 30_000 },
    });
    v.sides.A.pausesLeft = 0;
    expect(r.sides.A.pausesLeft).toBe(2);
  });
});

describe("parseH2HCommand", () => {
  test("valid commands", () => {
    expect(parseH2HCommand({ kind: "sub", outId: 3, inId: 14 })).toEqual({ kind: "sub", outId: 3, inId: 14 });
    expect(parseH2HCommand({ kind: "swap", aId: 3, bId: 4 })).toEqual({ kind: "swap", aId: 3, bId: 4 });
    expect(parseH2HCommand({ kind: "mentality", mentality: "attacking" })).toEqual({ kind: "mentality", mentality: "attacking" });
    expect(parseH2HCommand({ kind: "tactics", style: "high_press" })).toEqual({ kind: "tactics", style: "high_press" });
    expect(parseH2HCommand({ kind: "tactics", style: "balanced", axesOverride: { width: "wide" } }))
      .toEqual({ kind: "tactics", style: "balanced", axesOverride: { width: "wide" } });
    expect(parseH2HCommand({ kind: "formation", formation: "4-4-2" })).toEqual({ kind: "formation", formation: "4-4-2" });
    expect(parseH2HCommand({ kind: "instruction", slot: 1, instruction: { variant: "fb_inverted", press: "more" } }))
      .toEqual({ kind: "instruction", slot: 1, instruction: { variant: "fb_inverted", press: "more" } });
    expect(parseH2HCommand({ kind: "instruction", slot: 10, instruction: null }))
      .toEqual({ kind: "instruction", slot: 10, instruction: null });
    expect(parseH2HCommand({ kind: "marks", marks: [{ markerSlot: 2, targetId: 20 }, { markerSlot: 5, targetId: 21 }] }))
      .toEqual({ kind: "marks", marks: [{ markerSlot: 2, targetId: 20 }, { markerSlot: 5, targetId: 21 }] });
    expect(parseH2HCommand({ kind: "marks", marks: [] })).toEqual({ kind: "marks", marks: [] });
  });

  test("invalid commands are null", () => {
    const bad: unknown[] = [
      null, 3, "sub", [], {}, { kind: "nope" },
      { kind: "sub", outId: 3 },
      { kind: "sub", outId: 3, inId: 3 },
      { kind: "sub", outId: 0, inId: 4 },
      { kind: "sub", outId: 1.5, inId: 4 },
      { kind: "sub", outId: "3", inId: 4 },
      { kind: "sub", outId: 3, inId: 4, extra: 1 },
      { kind: "swap", aId: -1, bId: 4 },
      { kind: "mentality", mentality: "crazy" },
      { kind: "tactics", style: "total_football" },
      { kind: "tactics", style: "toString" },
      { kind: "tactics", style: "balanced", axesOverride: { width: "huge" } },
      { kind: "tactics", style: "balanced", axesOverride: null },
      { kind: "formation", formation: "custom" },
      { kind: "formation", formation: "2-3-5" },
      { kind: "instruction", slot: 11, instruction: null },
      { kind: "instruction", slot: -1, instruction: null },
      { kind: "instruction", slot: 2, instruction: { variant: "magic" } },
      { kind: "instruction", slot: 2, instruction: { press: "max" } },
      { kind: "instruction", slot: 2, instruction: { other: 1 } },
      { kind: "instruction", slot: 2 },
      { kind: "marks", marks: [{ markerSlot: 1, targetId: 2 }, { markerSlot: 3, targetId: 4 }, { markerSlot: 5, targetId: 6 }] },
      { kind: "marks", marks: [{ markerSlot: 1, targetId: 2 }, { markerSlot: 1, targetId: 4 }] },
      { kind: "marks", marks: [{ markerSlot: 1, targetId: 2 }, { markerSlot: 3, targetId: 2 }] },
      { kind: "marks", marks: [{ markerSlot: 11, targetId: 2 }] },
      { kind: "marks", marks: "x" },
    ];
    for (const raw of bad) expect(parseH2HCommand(raw)).toBeNull();
  });
});
