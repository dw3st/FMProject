import { describe, expect, test } from "bun:test";
import { mergeWireState, otherSide, parseH2HEvent, pauseClock } from "@/GameInterface/H2H/h2hState";
import type { GameState } from "@/GameEngine/types";
import type { H2HWireState } from "@/types/h2hTypes";

const wire = (extra: Record<string, unknown>) => ({ players: [{ id: 1 }], matchTime: 10, ...extra }) as unknown as H2HWireState;

describe("mergeWireState", () => {
  test("keeps the last benches when the wire leaves them out", () => {
    const first = mergeWireState(null, wire({ benchA: [{ id: 20 }], benchB: [{ id: 30 }] }));
    expect(first.benchA.map((p) => p.id)).toEqual([20]);
    const next = mergeWireState(first, wire({ matchTime: 20 }));
    expect(next.benchA).toBe(first.benchA);
    expect(next.benchB).toBe(first.benchB);
    expect(next.matchTime).toBe(20);
    expect(next.throughBallCellsCache).toBeNull();
    expect(next.pendingSubsA).toEqual([]);
  });

  test("new benches replace the old ones", () => {
    const first = mergeWireState(null, wire({ benchA: [{ id: 20 }], benchB: [] }));
    const next = mergeWireState(first, wire({ benchA: [{ id: 21 }] }));
    expect(next.benchA.map((p) => p.id)).toEqual([21]);
    expect(next.benchB).toBe(first.benchB);
  });

  test("no previous state and no benches: empty", () => {
    const s: GameState = mergeWireState(null, wire({}));
    expect(s.benchA).toEqual([]);
  });
});

describe("parseH2HEvent", () => {
  const ev = (o: object) => JSON.stringify(o);
  test("only this game's events", () => {
    expect(parseH2HEvent(ev({ type: "h2h_done", saveId: "s", fixtureId: "f" }), "s", "f")?.type).toBe("h2h_done");
    expect(parseH2HEvent(ev({ type: "h2h_done", saveId: "s", fixtureId: "g" }), "s", "f")).toBeNull();
    expect(parseH2HEvent(ev({ type: "friend_live", saveId: "s", fixtureId: "f" }), "s", "f")).toBeNull();
    expect(parseH2HEvent("not json", "s", "f")).toBeNull();
  });

  test("the room carries its game inside", () => {
    const room = { saveId: "s", fixtureId: "f" };
    expect(parseH2HEvent(ev({ type: "h2h_room", room, mySide: "B" }), "s", "f")?.type).toBe("h2h_room");
    expect(parseH2HEvent(ev({ type: "h2h_room", room, mySide: "C" }), "s", "f")).toBeNull();
    expect(parseH2HEvent(ev({ type: "h2h_room", room: { saveId: "x", fixtureId: "f" }, mySide: "A" }), "s", "f")).toBeNull();
  });

  test("malformed frames and states are dropped", () => {
    expect(parseH2HEvent(ev({ type: "h2h_frame", saveId: "s", fixtureId: "f", ball: [1, 2], players: [] }), "s", "f")).not.toBeNull();
    expect(parseH2HEvent(ev({ type: "h2h_frame", saveId: "s", fixtureId: "f" }), "s", "f")).toBeNull();
    expect(parseH2HEvent(ev({ type: "h2h_state", saveId: "s", fixtureId: "f", state: {} , stats: {} }), "s", "f")).toBeNull();
    expect(parseH2HEvent(ev({ type: "h2h_event", saveId: "s", fixtureId: "f", payload: {} }), "s", "f")).toBeNull();
  });
});

describe("pauseClock / otherSide", () => {
  test("seconds left, rounded up, never negative", () => {
    expect(pauseClock(30_000, 6_000)).toBe("0:24");
    expect(pauseClock(1_000, 5_000)).toBe("0:00");
    expect(pauseClock(90_500, 0)).toBe("1:31");
  });
  test("the other side", () => {
    expect(otherSide("A")).toBe("B");
    expect(otherSide("B")).toBe("A");
  });
});
